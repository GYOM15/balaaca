package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The list the lever always needed.
 *
 * <p>Suspension was keyed on a slug and nothing published one, so the operator
 * could reach a business only after a customer had already named it in a
 * complaint. The two queues are inboxes; an inbox cannot answer "who is on this
 * platform".
 *
 * <p>What matters most here is the same thing that matters in
 * {@code ModerationIT}: the BREADTH. This is the one read that crosses every
 * tenant at once, so it has to show what every public path hides - the
 * unpublished business and the suspended one - and it has to be reachable by
 * nobody but the operator. Both halves are asserted, because a listing that
 * showed only what the directory shows would be useless, and one a provider
 * could open would hand every business its rivals' standing.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class BusinessListingIT {

    private static final String LISTING = "/v1/admin/providers";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("The operator sees every business, including the ones no public path shows")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void theListingCrossesEveryTenant() {
        // The directory answers with what a customer may see. Barbier Cache has
        // never published, so it is not in it - and it is exactly the kind of
        // row an operator is looking for.
        given().when().get("/v1/providers").then().statusCode(200)
                .body("data.slug", not(hasItem("barbier-cache")));

        given().when().get(LISTING).then().statusCode(200)
                // Alphabetical by business name: Barbier Cache, Coiffeur Solo,
                // Salon Fatou. Ordered and not merely present, because the
                // cursor below is only meaningful over a stable sequence.
                .body("data.slug", contains("barbier-cache", "coiffeur-solo", "salon-fatou"))
                .body("data[0].business_name", equalTo("Barbier Cache"))
                .body("data[0].published", equalTo(false))
                .body("data[0].status", equalTo("ACTIVE"))
                .body("data[0].registered_at", notNullValue())
                .body("data[0].appointment_count", equalTo(0))
                // Never suspended, so it carries no accusation.
                .body("data[0].suspension_reason", nullValue())
                // The fixtures file no trade and no place, which is what an
                // incomplete registration looks like. Absent, not invented.
                .body("data[0].trade", nullValue())
                .body("data[0].locality", nullValue())
                .body("next_cursor", nullValue());
    }

    @Test
    @DisplayName("A provider cannot list the platform, and is told so without a stack trace")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void aProviderNeverReachesIt() {
        // The whole platform's standing, business by business, is the last
        // thing a rival should be able to read. The scope is the guard, and it
        // refuses before the resource runs - so the answer is a plain 403 that
        // the console turns into a sentence, and never a trace naming the class
        // that refused.
        given().when().get(LISTING).then().statusCode(403)
                .body(not(containsString("Exception")));
    }

    @Test
    @DisplayName("Without a token there is nothing to list")
    void anonymousSeesNothing() {
        given().when().get(LISTING).then().statusCode(401);
    }

    @Test
    @DisplayName("The operator finds a business by its name or by its handle")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void searchTakesEither() {
        // A name, from a telephone call.
        given().queryParam("q", "fatou").when().get(LISTING).then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].slug", equalTo("salon-fatou"));

        // A handle, from a link somebody sent him. The two are one parameter
        // because the operator does not know which he is holding.
        given().queryParam("q", "barbier-cache").when().get(LISTING).then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].business_name", equalTo("Barbier Cache"));

        given().queryParam("q", "atlantide").when().get(LISTING).then().statusCode(200)
                .body("data", hasSize(0))
                .body("next_cursor", nullValue());
    }

    @Test
    @DisplayName("The cursor walks the sequence once, and carries no row id")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void pagingIsTheSameEnvelopeAsEverywhereElse() {
        String cursor = given().queryParam("limit", 2).when().get(LISTING).then().statusCode(200)
                .body("data.slug", contains("barbier-cache", "coiffeur-solo"))
                .body("next_cursor", not(emptyOrNullString()))
                .extract().path("next_cursor");

        // No page repeats an entry and none is skipped, which is the whole
        // point of breaking the tie on the slug rather than on the name alone.
        given().queryParam("limit", 2).queryParam("cursor", cursor)
                .when().get(LISTING).then().statusCode(200)
                .body("data.slug", contains("salon-fatou"))
                .body("next_cursor", nullValue());

        // Opaque to the client, and it must stay that way: the cursor of a
        // provider sequence carries the published handle, never the row id that
        // row-level security compares.
        String decoded = new String(java.util.Base64.getUrlDecoder().decode(cursor),
                                    java.nio.charset.StandardCharsets.UTF_8);
        org.junit.jupiter.api.Assertions.assertFalse(
                decoded.contains(BookingFixtures.SOLO.toString()),
                "a page cursor handed back to a caller must not carry a provider row id");

        given().queryParam("cursor", "not-a-cursor").when().get(LISTING).then().statusCode(400);
    }

    @Test
    @DisplayName("What a suspension costs is on the row before the lever is pulled")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void theRowSaysWhatIsAtStake() {
        book();

        given().contentType("application/json")
                .body("""
                      {"reason":"Trois clients signalent des rendez-vous non honores."}
                      """)
                .when().post("/v1/admin/providers/salon-fatou/suspension").then().statusCode(200);

        given().queryParam("status", "SUSPENDED").when().get(LISTING).then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].slug", equalTo("salon-fatou"))
                .body("data[0].suspension_reason",
                      org.hamcrest.Matchers.containsString("non honores"))
                // The number that makes the decision honest. A suspension
                // cancels nothing already booked, so this is how many customers
                // are still expected at the door afterwards.
                .body("data[0].appointment_count", greaterThanOrEqualTo(1))
                // Still published: the page is the salon's, and suspension is
                // the platform's judgement rather than a deletion.
                .body("data[0].published", equalTo(true));

        given().queryParam("status", "ACTIVE").when().get(LISTING).then().statusCode(200)
                .body("data.slug", not(hasItem("salon-fatou")))
                .body("data.slug", hasItem("coiffeur-solo"));
    }

    private static void book() {
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(BookingFixtures.SALON_OFFERING))
                .when().post("/v1/providers/salon-fatou/appointments").then().statusCode(201);
    }
}
