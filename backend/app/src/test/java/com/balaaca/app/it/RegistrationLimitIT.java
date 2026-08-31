package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

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
 * The handle oracle that was left open.
 *
 * <p>V020 closed it for an account that already has a salon - that one is
 * answered before the slug is even looked at. An account WITHOUT a salon is
 * exactly the shape of a real signup, so it cannot be answered early: it has to
 * be told whether the handle is free, which is the answer an enumerator wants.
 *
 * <p>There is no cheaper way to enumerate handles than to ask, so the answer is
 * to make asking expensive rather than to make it lie. Ten tries an hour is
 * generous for a person - registering is something you do once, and a refused
 * slug twice is normal - and useless for a script.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.NEWCOMER_SUBJECT, roles = {})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.NEWCOMER_SUBJECT))
class RegistrationLimitIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        // Redis keeps the counter, and it outlives a truncated database on
        // purpose - which is precisely why each run needs its own subject.
        fixtures.execute("SELECT 1");
    }

    private static int probe(String slug) {
        return given().contentType("application/json")
                .body("""
                      {"slug":"%s","business_name":"Essai"}
                      """.formatted(slug))
                .when().post("/v1/providers").then().extract().statusCode();
    }

    @Test
    @DisplayName("Probing handles runs out of budget before it runs out of handles")
    void theOracleCosts() {
        // Every one of these is refused - salon-fatou is taken - and each still
        // costs a try. That is the point: a probe and a genuine mistake look
        // identical from the server, and charging only for successes would
        // leave the enumeration free.
        int refusals = 0;
        int limited = 0;
        for (int i = 0; i < 14; i++) {
            int status = probe("salon-fatou");
            if (status == 429) {
                limited++;
            } else if (status == 409 || status == 422) {
                refusals++;
            }
        }

        org.assertj.core.api.Assertions.assertThat(refusals)
                .as("the first tries are answered honestly")
                .isEqualTo(10);
        org.assertj.core.api.Assertions.assertThat(limited)
                .as("and then the budget is spent")
                .isEqualTo(4);
    }

    @Test
    @DisplayName("A limit that is reached says nothing about when it lifts")
    @TestSecurity(user = "kc-autre-essai", roles = {})
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-autre-essai"))
    void itDoesNotHelpAnAttackerPaceThemselves() {
        for (int i = 0; i < 10; i++) {
            probe("salon-fatou");
        }

        given().contentType("application/json")
                .body("{\"slug\":\"salon-fatou\",\"business_name\":\"Essai\"}")
                .when().post("/v1/providers").then().statusCode(429)
                .body("code", equalTo("RATE_LIMITED"))
                // No Retry-After and no remaining count: a limit that reports
                // its own window is a limit an attacker can pace against.
                .header("Retry-After", org.hamcrest.Matchers.nullValue());
    }

    @Test
    @DisplayName("One account's budget is not another's")
    @TestSecurity(user = "kc-troisieme-essai", roles = {})
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-troisieme-essai"))
    void theBudgetIsPerAccount() {
        // Keyed on the verified subject, not on an address a client controls.
        given().contentType("application/json")
                .body("""
                      {"slug":"salon-%s","business_name":"Essai"}
                      """.formatted(UUID.randomUUID().toString().substring(0, 8)))
                .when().post("/v1/providers").then().statusCode(201);
    }
}
