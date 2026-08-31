package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a customer can actually type into the hub's search box.
 *
 * <p>The box is the first thing on the home page and the whole point of it, and
 * it used to match the business NAME and nothing else. Somebody looking for
 * braids types "tresses"; no business is literally named Tresses; the answer was
 * nothing.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class DirectorySearchIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        fixtures.execute("""
                UPDATE providers SET category_id =
                        (SELECT id FROM provider_categories WHERE slug = 'photographie')
                 WHERE slug = 'coiffeur-solo';
                UPDATE providers SET category_id =
                        (SELECT id FROM provider_categories WHERE slug = 'coiffure')
                 WHERE slug = 'salon-fatou'
                """);
    }

    private static List<String> search(String q) {
        return given().queryParam("q", q).when().get("/v1/providers")
                .then().statusCode(200)
                .extract().jsonPath().getList("data.slug", String.class);
    }

    @Test
    @DisplayName("A customer finds a salon by what it does, not by what it is called")
    void findsAProviderByItsServiceName() {
        // Salon Fatou offers "Tresses". It is not named Tresses, and that used
        // to be the end of the search.
        assertThat(search("tresses")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("A customer finds a provider by its trade")
    void findsAProviderByItsTrade() {
        // "photographie" is the label of the trade, not the name of the
        // business and not one of its services.
        assertThat(search("photograph")).containsExactly("coiffeur-solo");
    }

    @Test
    @DisplayName("The business name still matches, and case does not matter")
    void stillFindsAProviderByName() {
        assertThat(search("FATOU")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("A retired service stops being findable")
    void doesNotMatchARetiredService() {
        fixtures.execute("""
                UPDATE service_offerings SET active = false
                 WHERE provider_id = '%s'
                """.formatted(BookingFixtures.SALON));

        // The provider is still there; the word is not one of its offers any
        // more, so it is not one of the ways to reach it.
        assertThat(search("tresses")).isEmpty();
        assertThat(search("Fatou")).containsExactly("salon-fatou");
    }

    @Test
    @DisplayName("An unpublished provider is not findable by its services either")
    void doesNotMatchAnUnpublishedProvidersServices() {
        // barbier-cache offers "Coupe" and is not published. The new policy
        // admits the services of PUBLISHED providers only - otherwise the search
        // would become a way to discover businesses the public path hides.
        assertThat(search("Coupe")).doesNotContain("barbier-cache");
    }

    @Test
    @DisplayName("Searching by service does not hand out the catalogue")
    void matchesWithoutPublishing() {
        var body = given().queryParam("q", "tresses").when().get("/v1/providers")
                .then().statusCode(200).extract().body().asString();

        // The row is MATCHED, never returned. A directory card carries a slug
        // and a name; the catalogue belongs to the provider's own page.
        assertThat(body).doesNotContain("Tresses").doesNotContain("price");
    }

    @Test
    @DisplayName("Public answers say how long they may be reused, and slots say never")
    void declaresItsCaching() {
        given().when().get("/v1/categories").then()
                .header("Cache-Control", equalTo("public, max-age=3600"));
        given().when().get("/v1/providers").then()
                .header("Cache-Control", equalTo("public, max-age=60"));
        given().when().get("/v1/providers/salon-fatou").then()
                .header("Cache-Control", equalTo("public, max-age=60"));
        given().when().get("/v1/providers/salon-fatou/opening-hours").then()
                .header("Cache-Control", equalTo("public, max-age=300"));

        // The important one. Every booking changes this answer, so a stale slot
        // list sends a customer to a slot that is gone - the defect the
        // union-across-chairs fix removed, produced again from the other side.
        given().queryParam("service_offering_id", BookingFixtures.SALON_OFFERING)
                .queryParam("from", "2026-09-04").queryParam("to", "2026-09-04")
                .when().get("/v1/providers/salon-fatou/available-slots").then()
                .header("Cache-Control", equalTo("no-store"));
    }
}
