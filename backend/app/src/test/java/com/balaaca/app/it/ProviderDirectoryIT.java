package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The hub: finding a provider without already knowing its handle.
 *
 * <p>The paging tests are the ones that matter. A directory a client walks page
 * by page must never drop a business or show one twice, and the two failures
 * look identical to a reader - the salon that never appears is invisible to
 * everyone and knows nothing about it.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ProviderDirectoryIT {

    private static final String DIRECTORY = "/v1/providers";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        // Fixtures ship two published providers and one hidden. The directory
        // needs enough of them to page, and a name carrying the cursor's own
        // separator, which a business is entitled to be called.
        fixtures.execute("""
                UPDATE providers SET city = 'Conakry',
                       category_id = (SELECT id FROM provider_categories
                                       WHERE slug = 'coiffure')
                 WHERE slug = 'salon-fatou';
                UPDATE providers SET city = 'Kindia' WHERE slug = 'coiffeur-solo';
                INSERT INTO providers (id, slug, business_name, city, published, status) VALUES
                  ('0be11e00-0000-0000-0000-000000000001','beaute-nzerekore','Beaute Nzerekore','Nzerekore',true,'ACTIVE'),
                  ('0be11e00-0000-0000-0000-000000000002','chez-a-b','Chez A | B','Conakry',true,'PENDING'),
                  ('0be11e00-0000-0000-0000-000000000003','dakar-style','Dakar Style','Conakry',true,'ACTIVE')
                """);
    }

    private static List<String> names(String query) {
        return given().when().get(DIRECTORY + query).then().statusCode(200)
                .extract().jsonPath().getList("data.business_name", String.class);
    }

    @Test
    @DisplayName("Anyone can read the directory, and it is ordered by name")
    void listsPublishedProvidersAlphabetically() {
        assertThat(names(""))
                .containsExactly("Beaute Nzerekore", "Chez A | B", "Coiffeur Solo",
                                 "Dakar Style", "Salon Fatou");
    }

    @Test
    @DisplayName("A provider that has not published is not in it")
    void omitsAnUnpublishedProvider() {
        // Not filtered out by this query: providers_public_read never admits the
        // row to the role serving an unauthenticated request.
        assertThat(names("")).doesNotContain("Barbier Cache");
    }

    @Test
    @DisplayName("A newly published salon appears while still PENDING")
    void includesAProviderStillPending() {
        // Registration produces PENDING, and publishing does not change it.
        // A directory filtered on ACTIVE would hide every new salon while
        // leaving it bookable by handle.
        assertThat(names("")).contains("Chez A | B");
    }

    @Test
    @DisplayName("The card carries no way to contact the business")
    void publishesNoContactDetails() {
        // One request returns every provider, so anything here is a mailing
        // list. The phone lives on the page, one business at a time.
        var body = given().when().get(DIRECTORY).then().statusCode(200)
                .extract().body().asString();

        assertThat(body)
                .doesNotContain("phone")
                .doesNotContain("email")
                .doesNotContain("address")
                .doesNotContain("published")
                .doesNotContain("status");
    }

    @Test
    @DisplayName("A search matches part of a name, in any case")
    void searchesByName() {
        assertThat(names("?q=nzere")).containsExactly("Beaute Nzerekore");
        assertThat(names("?q=SALON")).containsExactly("Salon Fatou");
    }

    @Test
    @DisplayName("A one-letter search is refused rather than answered with everything")
    void refusesTooShortASearch() {
        given().when().get(DIRECTORY + "?q=a").then().statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A search matching nothing is an empty page, not an error")
    void returnsAnEmptyPage() {
        given().when().get(DIRECTORY + "?q=zzzzz").then().statusCode(200)
                .body("data", hasSize(0))
                .body("next_cursor", nullValue());
    }

    @Test
    @DisplayName("The category filter is exact")
    void filtersByCategory() {
        assertThat(names("?category_slug=coiffure")).containsExactly("Salon Fatou");
        assertThat(names("?category_slug=plomberie")).isEmpty();
    }

    @Test
    @DisplayName("The city matches whole and case-insensitively, never as a prefix")
    void filtersByCity() {
        assertThat(names("?city=conakry"))
                .containsExactly("Chez A | B", "Dakar Style", "Salon Fatou");
        // Not a prefix match: Kindia is not in Conakry, and "Cona" is not a city.
        assertThat(names("?city=Cona")).isEmpty();
    }

    @Test
    @DisplayName("Filters combine")
    void combinesFilters() {
        assertThat(names("?city=Conakry&q=Dakar")).containsExactly("Dakar Style");
    }

    @Test
    @DisplayName("Walking every page shows each business exactly once")
    void pagesWithoutDroppingOrRepeating() {
        // The failure this rules out is silent: a salon that falls into a page
        // boundary is invisible to every customer and never finds out.
        List<String> walked = new ArrayList<>();
        String cursor = null;
        for (int page = 0; page < 10; page++) {
            var response = given().queryParam("limit", 2)
                    .queryParam("cursor", cursor)
                    .when().get(DIRECTORY).then().statusCode(200).extract().jsonPath();
            walked.addAll(response.getList("data.business_name", String.class));
            cursor = response.getString("next_cursor");
            if (cursor == null) {
                break;
            }
        }
        assertThat(walked)
                .containsExactly("Beaute Nzerekore", "Chez A | B", "Coiffeur Solo",
                                 "Dakar Style", "Salon Fatou")
                .doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("A cursor survives a name carrying its own separator")
    void pagesPastAnAwkwardName() {
        // "Chez A | B" is a legitimate business name and the cursor encodes a
        // name and an id separated by a bar. Unescaped, paging past this salon
        // either fails or skips it.
        var first = given().queryParam("limit", 2).when().get(DIRECTORY)
                .then().statusCode(200).extract().jsonPath();
        assertThat(first.getList("data.business_name", String.class))
                .containsExactly("Beaute Nzerekore", "Chez A | B");

        assertThat(names("?limit=2&cursor=" + first.getString("next_cursor")))
                .containsExactly("Coiffeur Solo", "Dakar Style");
    }

    @Test
    @DisplayName("The last page says so rather than offering a cursor to nothing")
    void closesTheLastPage() {
        given().queryParam("limit", 50).when().get(DIRECTORY).then().statusCode(200)
                .body("data", hasSize(5))
                .body("next_cursor", nullValue());
    }

    @Test
    @DisplayName("The cursor hands out nothing a customer could not already read")
    void carriesNoInternalIdentifier() {
        // Walking the hub one entry at a time used to hand an anonymous caller
        // the providers.id of every business on the platform - the value RLS
        // compares in `id = app_current_provider()`, and the one the contract
        // says is returned once at registration and never accepted back.
        String cursor = given().queryParam("limit", 1).when().get(DIRECTORY)
                .then().statusCode(200).extract().jsonPath().getString("next_cursor");

        String decoded = new String(java.util.Base64.getUrlDecoder().decode(cursor),
                                    java.nio.charset.StandardCharsets.UTF_8);

        assertThat(decoded).isEqualTo("Beaute Nzerekore|beaute-nzerekore");
        assertThat(decoded)
                .as("no uuid of any kind belongs in a cursor handed to a stranger")
                .doesNotMatch("(?s).*[0-9a-f]{8}-[0-9a-f]{4}-.*");
    }

    @Test
    @DisplayName("A cursor the server did not mint is a bad request, not a 500")
    void refusesAForgedCursor() {
        given().queryParam("cursor", "pas-du-tout-un-curseur")
                .when().get(DIRECTORY).then().statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A cursor keeps its filter honest")
    void keepsFiltersAcrossPages() {
        var first = given().queryParam("limit", 1).queryParam("city", "Conakry")
                .when().get(DIRECTORY).then().statusCode(200).extract().jsonPath();

        assertThat(names("?limit=1&city=Conakry&cursor=" + first.getString("next_cursor")))
                .containsExactly("Dakar Style");
    }

    @Test
    @DisplayName("A card points at the page that carries the rest")
    void carriesTheHandle() {
        given().queryParam("q", "Nzere").when().get(DIRECTORY).then().statusCode(200)
                .body("data[0].slug", equalTo("beaute-nzerekore"))
                .body("data[0].city", equalTo("Nzerekore"))
                .body("data.slug", not(contains("barbier-cache")));
    }
}
