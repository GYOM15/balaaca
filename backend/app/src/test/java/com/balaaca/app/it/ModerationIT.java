package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
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
 * The platform's own hand, and the inbox that tells it when to use it.
 *
 * <p>`providers.status` carried four values and no writer: every business was
 * PENDING for ever and SUSPENDED was unreachable, so the platform's only lever
 * against a business that defrauds its customers did not exist. It was
 * invisible because the public read policy admitted PENDING and ACTIVE alike.
 *
 * <p>What matters most in these tests is the BREADTH of a suspension. It is one
 * predicate in one policy, and every public path binds the provider through it,
 * so a suspended business has to disappear from all of them at once - the
 * directory, the page, the hours, the slots and the booking route. A lever that
 * removes a salon from the listing while its booking link still works is not a
 * lever.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ModerationIT {

    private static final String SALON = "salon-fatou";
    private static final String SUSPENSION = "/v1/admin/providers/" + SALON + "/suspension";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static void suspend() {
        given().contentType("application/json")
                .body("""
                      {"reason":"Trois clients signalent des rendez-vous non honores."}
                      """)
                .when().post(SUSPENSION).then().statusCode(200)
                .body("status", equalTo("SUSPENDED"))
                .body("suspension_reason", containsString("non honores"));
    }

    @Test
    @DisplayName("Every business is live on arrival; nobody vets it")
    void thereIsNoWaitingRoom() {
        // The decision this whole migration rests on. PENDING meant "waiting to
        // be let in" and nobody is waiting, so it is gone rather than left as a
        // state nothing can leave.
        given().when().get("/v1/providers").then().statusCode(200)
                .body("data.slug", hasItem(SALON));
    }

    @Test
    @DisplayName("A suspended business disappears from every public path at once")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void suspensionReachesEverywhere() {
        given().when().get("/v1/providers/" + SALON).then().statusCode(200);

        suspend();

        // The listing, the page, the hours, the team, the slots and the booking
        // route. One policy, one behaviour - and if any of these still answered,
        // the lever would have a hole in exactly the place a customer would find.
        given().when().get("/v1/providers").then().statusCode(200)
                .body("data.slug", not(hasItem(SALON)));
        given().when().get("/v1/providers/" + SALON).then().statusCode(404);
        given().when().get("/v1/providers/" + SALON + "/opening-hours").then().statusCode(404);
        given().when().get("/v1/providers/" + SALON + "/staff").then().statusCode(404);
        given().queryParam("service_offering_id", BookingFixtures.SALON_OFFERING.toString())
                .queryParam("from", "2026-09-07").queryParam("to", "2026-09-07")
                .when().get("/v1/providers/" + SALON + "/available-slots").then().statusCode(404);

        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(BookingFixtures.SALON_OFFERING))
                .when().post("/v1/providers/" + SALON + "/appointments").then().statusCode(404);
    }

    @Test
    @DisplayName("The salon can read on its own dashboard why its page vanished")
    // Both scopes on one token, which no real caller has: the operator holds
    // admin:moderation and no salon, the salon holds dashboard:read and no
    // moderation. The test needs one identity to do both in sequence, and what
    // it is asserting is the profile, not the authorisation - which
    // theScopeIsTheWholeGuard covers on its own.
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"admin:moderation", "dashboard:read"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theProviderIsToldWhy() {
        suspend();

        // Without this the only signal a business gets is that customers
        // stopped arriving, which is how a support burden and a reputation are
        // made at the same time.
        given().when().get("/v1/provider-profile").then().statusCode(200)
                .body("status", equalTo("SUSPENDED"))
                .body("suspension_reason", containsString("non honores"))
                .body("suspended_at", org.hamcrest.Matchers.notNullValue())
                // And the page is still theirs: suspension is the platform's
                // judgement, not a deletion. published is untouched.
                .body("published", equalTo(true));
    }

    @Test
    @DisplayName("A reinstated business stops carrying the accusation")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void reinstatementClearsTheReason() {
        suspend();

        given().when().delete(SUSPENSION).then().statusCode(200)
                .body("status", equalTo("ACTIVE"))
                .body("suspended_at", nullValue())
                .body("suspension_reason", nullValue());

        given().when().get("/v1/providers/" + SALON).then().statusCode(200);

        // The trail keeps both decisions. A platform that could erase its own
        // suspension could deny having made it.
        var trail = fixtures.auditTrail().stream().map(BookingFixtures.AuditRow::action).toList();
        org.junit.jupiter.api.Assertions.assertTrue(trail.contains("PROVIDER_SUSPENDED"));
        org.junit.jupiter.api.Assertions.assertTrue(trail.contains("PROVIDER_REINSTATED"));
    }

    @Test
    @DisplayName("Suspending twice, or a slug that does not exist, is one 404")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void nothingToDoIsNotFound() {
        suspend();

        given().contentType("application/json").body("{\"reason\":\"encore\"}")
                .when().post(SUSPENSION).then().statusCode(404)
                .body("code", equalTo("RESOURCE_NOT_FOUND"));

        given().contentType("application/json").body("{\"reason\":\"qui ca\"}")
                .when().post("/v1/admin/providers/atlantide/suspension")
                .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("A provider cannot suspend anybody, including a rival")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theScopeIsTheWholeGuard() {
        given().contentType("application/json").body("{\"reason\":\"la concurrence\"}")
                .when().post("/v1/admin/providers/coiffeur-solo/suspension")
                .then().statusCode(403);
    }

    @Test
    @DisplayName("A reason is mandatory, because the trail is the point")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void noSilentSuspension() {
        given().contentType("application/json").body("{}")
                .when().post(SUSPENSION).then().statusCode(400);

        given().contentType("application/json").body("{\"reason\":\"   \"}")
                .when().post(SUSPENSION).then().statusCode(400);
    }
}
