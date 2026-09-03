package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What is still missing, said before the refusal rather than as it.
 *
 * <p>The three conditions have existed since publishing had a gate, and until
 * now a provider could only learn them by failing: fill in a form, press
 * publish, be told what should have come first. Registration then dropped them
 * on that form with no idea any of it existed.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "profile:write", "catalog:write", "schedule:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class ReadinessIT {

    private static final String READINESS = "/v1/provider-profile/readiness";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("A furnished salon is ready, and says so before it is asked")
    void itAnswersWithoutFailingFirst() {
        // The shared decor gives the salon a service, a week of hours and a
        // bookable owner - which is a business ready to publish.
        given().when().get(READINESS).then().statusCode(200)
                .body("has_service", is(true))
                .body("has_hours", is(true))
                .body("has_bookable_staff", is(true))
                .body("can_publish", is(true))
                .body("published", is(true));
    }

    @Test
    @DisplayName("An empty catalogue is named as itself")
    void itNamesTheMissingService() {
        fixtures.execute("DELETE FROM service_offerings WHERE provider_id = '%s'"
                .formatted(BookingFixtures.SALON));

        given().when().get(READINESS).then().statusCode(200)
                .body("has_service", is(false))
                .body("can_publish", is(false));
    }

    @Test
    @DisplayName("Nobody bookable is not reported as missing hours")
    void itDoesNotSendAProviderToTheWrongScreen() {
        // This is the reason staff is asked separately. No bookable person
        // means no combined hours either, so a naive answer would say "you
        // have no opening hours" - and the provider would go and fill in a
        // week that was already there.
        fixtures.execute("UPDATE provider_staff SET bookable = false WHERE provider_id = '%s'"
                .formatted(BookingFixtures.SALON));

        given().when().get(READINESS).then().statusCode(200)
                .body("has_service", is(true))
                .body("has_bookable_staff", is(false))
                .body("can_publish", is(false));
    }

    @Test
    @DisplayName("What it promises is what the gate answers")
    void theTwoAgree() {
        fixtures.execute("DELETE FROM service_offerings WHERE provider_id = '%s'"
                .formatted(BookingFixtures.SALON));

        given().when().get(READINESS).then().statusCode(200)
                .body("can_publish", is(false));

        // The same predicates, so a screen that hides the button when
        // can_publish is false hides it exactly when pressing it would fail.
        given().contentType("application/json")
                .body("""
                      {"business_name":"Salon Fatou","timezone":"Africa/Conakry",
                       "published":true}
                      """)
                .when().put("/v1/provider-profile").then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));
    }
}
