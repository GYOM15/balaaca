package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Whether a booking arrives confirmed, and the trades a hub browses by.
 *
 * <p>Both were columns nothing read. {@code auto_confirm} DEFAULTs to true and
 * had no reader at all, so every appointment was born PENDING and every salon
 * confirmed by hand while the schema promised the opposite;
 * {@code provider_categories} has eighteen rows and no route ever returned one,
 * so the hub's own "browse by trade" had nothing to draw.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class BookingPolicyIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String book(String slug, UUID offering, String startsAt, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Mariama B.","phone":"%s"}}
                      """.formatted(offering, startsAt, phone))
                .when().post("/v1/providers/" + slug + "/appointments")
                .then().statusCode(201)
                .extract().jsonPath().getString("reference");
    }

    @Test
    @DisplayName("A salon that vets its bookings receives them PENDING")
    void leavesABookingPendingWhenTheProviderVetsThem() {
        String reference = book("salon-fatou", BookingFixtures.SALON_OFFERING,
                                "2026-09-04T10:00:00Z", "622000001");

        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("A provider that confirms automatically receives them CONFIRMED")
    void confirmsOnArrivalWhenTheProviderSaysSo() {
        // The column defaults to true and nothing read it, so a solo barber who
        // wanted a customer to have certainty immediately still had to open the
        // dashboard and press a button.
        String reference = book("coiffeur-solo", BookingFixtures.SOLO_OFFERING,
                                "2026-09-04T10:00:00Z", "622000002");

        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("status", equalTo("CONFIRMED"));
    }

    @Test
    @DisplayName("The policy is read from the row, so changing it changes the next booking")
    void readsThePolicyFromTheRowEachTime() {
        fixtures.execute("UPDATE providers SET auto_confirm = true WHERE slug = 'salon-fatou'");

        String reference = book("salon-fatou", BookingFixtures.SALON_OFFERING,
                                "2026-09-04T14:00:00Z", "622000003");

        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("status", equalTo("CONFIRMED"));
    }

    @Test
    @DisplayName("A customer's number is normalised against the PROVIDER's country")
    void normalisesThePhoneAgainstTheProvidersCountry() {
        // "GN" was hardcoded at the booking edge while providers.country_code
        // existed and nothing read it - against a product rule saying nothing
        // may hardcode a single market, and against PhoneNumber's own javadoc.
        fixtures.execute("UPDATE providers SET country_code = 'CI' WHERE slug = 'coiffeur-solo'");

        book("coiffeur-solo", BookingFixtures.SOLO_OFFERING,
             "2026-09-04T10:00:00Z", "0707070707");

        assertThat(fixtures.customerPhones(BookingFixtures.SOLO))
                .as("an Ivorian number at an Ivorian salon is +225, not +224")
                .containsExactly("+2250707070707");
    }

    @Test
    @DisplayName("The hub has trades to browse by")
    void publishesTheTaxonomy() {
        var trades = given().when().get("/v1/categories").then().statusCode(200)
                .extract().jsonPath().getList("data.slug", String.class);

        assertThat(trades)
                .contains("coiffure", "photographie", "traiteur", "dj-animation",
                          "decoration-evenementielle")
                // Withdrawn trades are absent: a provider that already carries
                // one keeps it, nobody new can choose it.
                .doesNotContain("retire");
    }

    @Test
    @DisplayName("They come back in the order they should be shown, with their label")
    void ordersThemForDisplay() {
        var first = given().when().get("/v1/categories").then().statusCode(200)
                .extract().jsonPath();

        assertThat(first.getList("data.slug", String.class)).hasSizeGreaterThan(10);
        assertThat(first.getString("data[0].slug")).isEqualTo("coiffure");
        assertThat(first.getString("data[0].label_fr")).isEqualTo("Coiffure");
        // A name a client resolves in its own set, never a URL: the platform
        // ships no image for a trade.
        assertThat(first.getString("data[0].icon")).isEqualTo("scissors");
    }

    @Test
    @DisplayName("Anyone can read it, and it is one page")
    void needsNoAccountAndNoCursor() {
        var body = given().when().get("/v1/categories").then().statusCode(200)
                .extract().body().asString();

        // A hub with two hundred trades is a hub nobody can browse, so inventing
        // a cursor here would make every client walk a loop that runs once.
        assertThat(body).doesNotContain("next_cursor");
        given().when().get("/v1/categories").then().body("data", hasSize(18));
    }
}
