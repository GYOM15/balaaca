package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Where a business is, and how a customer says it.
 *
 * <p>Two halves of one question, modelled deliberately differently. The map is
 * CLOSED - eight regions, thirty-three prefectures, ten communes - and covers
 * the whole country, interior included. The quartier is not: Guinea has
 * thousands of them, the platform does not author them, and a curated list
 * would be missing exactly the one the next provider lives in.
 *
 * <p>So one is reference data and the other is free text with a fold and a
 * type-ahead. These tests are mostly about the seam between them.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class LocalityIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("The map covers the whole country, not only Conakry")
    void theMapIsNational() {
        given().when().get("/v1/localities").then().statusCode(200)
                // Eight regions and thirty-three prefectures, so a garage in
                // Kankan is as filterable as a salon in Ratoma.
                .body("data.size()", greaterThan(40))
                .body("data.findAll { it.kind == 'REGION' }.size()", equalTo(8))
                .body("data.slug", hasItems("kankan", "nzerekore", "labe", "boke", "ratoma"))
                // A commune names its prefecture, and a region names nobody.
                .body("data.find { it.slug == 'ratoma' }.parent_slug", equalTo("conakry"))
                .body("data.find { it.slug == 'kankan-region' }.parent_slug", equalTo(null))
                // ISO 3166-2 on the regions, and deliberately nowhere else. The
                // standard stops at the prefecture - which is why the code is an
                // attribute here and not the search key - and the prefecture
                // codes it DOES publish are not written, because guessing
                // thirty-three of them would be inventing data that looks
                // authoritative.
                .body("data.find { it.slug == 'kankan-region' }.iso_3166_2", equalTo("GN-K"))
                .body("data.find { it.slug == 'kankan' }.iso_3166_2", equalTo(null))
                .body("data.find { it.slug == 'ratoma' }.iso_3166_2", equalTo(null));
    }

    @Test
    @DisplayName("A region named after its own prefecture does not take its slug")
    void theTownKeepsThePlainSlug() {
        given().when().get("/v1/localities").then().statusCode(200)
                // Seven of the eight regions are named after one of their own
                // prefectures. A customer typing "Boke" means the town, so the
                // prefecture keeps the plain slug and the region is suffixed.
                .body("data.find { it.slug == 'boke' }.kind", equalTo("PREFECTURE"))
                .body("data.find { it.slug == 'boke-region' }.kind", equalTo("REGION"));
    }

    @Test
    @DisplayName("The map is cached for an hour; it changes by migration")
    void itIsCachedLongerThanTheTaxonomy() {
        given().when().get("/v1/localities").then().statusCode(200)
                .header("Cache-Control", equalTo("public, max-age=3600"));
    }

    @Test
    @DisplayName("Asking for a prefecture matches the businesses in its communes")
    void theFilterMatchesDownTheTree() {
        fileTheSalonIn("ratoma", "Nongo");

        // Conakry is the prefecture; Ratoma is one of its ten communes. A
        // customer looking in the capital must find a salon filed under the
        // commune, or the filter is worth nothing.
        given().when().get("/v1/providers?locality=conakry").then().statusCode(200)
                .body("data.slug", hasItem("salon-fatou"));

        given().when().get("/v1/providers?locality=ratoma").then().statusCode(200)
                .body("data.slug", hasItem("salon-fatou"))
                // And it does not match sideways: Matoto is Ratoma's neighbour,
                // not its parent.
                .body("data.size()", equalTo(1));

        given().when().get("/v1/providers?locality=matoto").then().statusCode(200)
                .body("data.slug", not(hasItem("salon-fatou")));
    }

    @Test
    @DisplayName("The card carries the place, so a client need not fetch the map")
    void theCardNamesWhereItIs() {
        fileTheSalonIn("ratoma", "Nongo");

        given().when().get("/v1/providers?locality=ratoma").then().statusCode(200)
                .body("data[0].locality.slug", equalTo("ratoma"))
                .body("data[0].locality.label_fr", equalTo("Ratoma"))
                .body("data[0].area", equalTo("Nongo"));
    }

    @Test
    @DisplayName("The quartier is folded, so three spellings are one value")
    void theQuartierIsFolded() {
        fileTheSalonIn("ratoma", "Nongo");

        // The stored column is generated: lowercased and stripped of accents.
        // What the customer typed is compared the same way, so all three of
        // these are the same neighbourhood.
        for (String typed : new String[] {"Nongo", "nongo", "NONGO"}) {
            given().when().get("/v1/providers?area=" + typed).then().statusCode(200)
                    .body("data.slug", hasItem("salon-fatou"));
        }
        given().when().get("/v1/providers?area=Kipe").then().statusCode(200)
                .body("data.size()", equalTo(0));
    }

    @Test
    @DisplayName("The quartiers offered are the ones providers wrote")
    void theSuggestionsComeFromRegistrations() {
        fileTheSalonIn("ratoma", "Nongo");

        given().when().get("/v1/areas").then().statusCode(200)
                .body("data.label", hasItem("Nongo"))
                .body("data.find { it.label == 'Nongo' }.provider_count", equalTo(1));

        // Narrowed to a subtree, which is what makes the type-ahead useful: the
        // quartiers of Ratoma rather than of the whole country.
        given().when().get("/v1/areas?locality=ratoma").then().statusCode(200)
                .body("data.label", hasItem("Nongo"));
        given().when().get("/v1/areas?locality=kankan").then().statusCode(200)
                .body("data.size()", equalTo(0));

        // And matched on the fold, so a customer typing two letters gets there.
        given().when().get("/v1/areas?q=non").then().statusCode(200)
                .body("data.label", hasItem("Nongo"));
    }

    @Test
    @DisplayName("An unpublished provider puts no word in front of a customer")
    void onlyPublishedProvidersSuggest() {
        // barbier-cache is unpublished by the shared decor.
        fixtures.execute("""
                UPDATE providers SET locality_id = (SELECT id FROM localities WHERE slug='matoto'),
                                     area = 'Sangoyah'
                 WHERE slug = 'barbier-cache'
                """);

        given().when().get("/v1/areas").then().statusCode(200)
                .body("data.label", not(hasItem("Sangoyah")));
    }

    @Test
    @DisplayName("Every quartier offered belongs to some published provider")
    void nothingIsInvented() {
        fileTheSalonIn("ratoma", "Nongo");

        given().when().get("/v1/areas").then().statusCode(200)
                .body("data.provider_count", everyItem(greaterThan(0)));
    }

    private void fileTheSalonIn(String locality, String area) {
        fixtures.execute("""
                UPDATE providers
                   SET locality_id = (SELECT id FROM localities WHERE slug = '%s'),
                       area = '%s'
                 WHERE slug = 'salon-fatou'
                """.formatted(locality, area));
    }
}
