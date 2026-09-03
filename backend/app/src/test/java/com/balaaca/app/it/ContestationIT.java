package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

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
 * A business answering the platform back.
 *
 * <p>Moderation needs three things and had two. The platform could record what
 * it decided and undo it; the business could read the reason on its dashboard
 * and do nothing with it. That asymmetry is what separates a platform from an
 * arbitrary one, and it is the half these tests are about.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ContestationIT {

    private static final String CONTEST = "/v1/provider-profile/contestation";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private void suspendTheSalon() {
        fixtures.execute("""
                UPDATE providers
                   SET status = 'SUSPENDED', suspended_at = now(),
                       suspension_reason = 'Trois clients signalent des absences.'
                 WHERE slug = 'salon-fatou'
                """);
    }

    private static io.restassured.response.ValidatableResponse contest(String message) {
        return given().contentType("application/json")
                .body("{\"message\":\"%s\"}".formatted(message))
                .when().post(CONTEST).then();
    }

    @Test
    @DisplayName("A suspended business can answer, and read back what it sent")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theBusinessCanAnswer() {
        suspendTheSalon();

        contest("Les trois rendez-vous ont ete honores, j ai les preuves.")
                .statusCode(201)
                .body("read", equalTo(false))
                .body("about_suspension_at", org.hamcrest.Matchers.notNullValue());

        // A business that cannot check its own message arrived has no more than
        // the electronic mail address this replaced.
        given().when().get(CONTEST).then().statusCode(200)
                .body("message", org.hamcrest.Matchers.containsString("honores"));
    }

    @Test
    @DisplayName("There is nothing to contest when nobody decided anything")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void anUnsuspendedBusinessHasNothingToSay() {
        contest("je proteste").statusCode(422)
                .body("code", equalTo("VALIDATION_FAILED"));

        // And the read says nothing rather than an empty shape full of nulls,
        // which would make a client decide what that meant.
        given().when().get(CONTEST).then().statusCode(204);
    }

    @Test
    @DisplayName("One message per suspension; pressing twice meant it once")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void oneAnswerPerEpisode() {
        suspendTheSalon();

        contest("premier message").statusCode(201);
        contest("deuxieme message").statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        // The first stands. Silently replacing it would lose what they wrote.
        given().when().get(CONTEST).then().statusCode(200)
                .body("message", equalTo("premier message"));
    }

    @Test
    @DisplayName("A new suspension can be answered again")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void aSecondEpisodeIsANewConversation() {
        suspendTheSalon();
        contest("premier episode").statusCode(201);

        // Reinstated, then suspended again for something else entirely.
        fixtures.execute("""
                UPDATE providers SET status='ACTIVE', suspended_at=NULL,
                                     suspension_reason=NULL
                 WHERE slug='salon-fatou';
                UPDATE providers
                   SET status='SUSPENDED', suspended_at = now() + interval '1 second',
                       suspension_reason='Autre chose, des mois plus tard.'
                 WHERE slug='salon-fatou'
                """);

        contest("deuxieme episode").statusCode(201);
        given().when().get(CONTEST).then().statusCode(200)
                .body("message", equalTo("deuxieme episode"));
    }

    @Test
    @DisplayName("The operator reads it beside the reports, and marking it read is not agreeing")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void theOperatorWorksTheQueue() {
        fixtures.execute("""
                UPDATE providers
                   SET status = 'SUSPENDED', suspended_at = now(),
                       suspension_reason = 'Motif enregistre.'
                 WHERE slug = 'salon-fatou';
                INSERT INTO provider_contestations
                    (id, provider_id, message, about_suspension_at)
                SELECT gen_random_uuid(), id, 'Je conteste cette decision.', suspended_at
                  FROM providers WHERE slug = 'salon-fatou'
                """);

        String id = given().when().get("/v1/admin/contestations?status=PENDING")
                .then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].provider_slug", equalTo("salon-fatou"))
                // The reason the provider carries NOW, so the operator sees at
                // a glance that this is still about a live decision.
                .body("data[0].current_reason", equalTo("Motif enregistre."))
                .extract().path("data[0].contestation_id");

        given().when().post("/v1/admin/contestations/" + id + "/reading")
                .then().statusCode(200).body("status", equalTo("READ"));

        // Read is not reinstated. The business is still suspended, and that is
        // a separate decision with its own audit row.
        given().when().get("/v1/providers/salon-fatou").then().statusCode(404);
    }

    @Test
    @DisplayName("A provider cannot read another business's answer")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theQueueIsTheOperators() {
        given().when().get("/v1/admin/contestations").then().statusCode(403);
    }
}
