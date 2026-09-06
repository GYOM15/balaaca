package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
 * The other side of an opinion.
 *
 * <p>V050 gave a customer the right to say what happened and gave the business
 * no way to answer. A hub that publishes the accusation and refuses the answer
 * is not neutral, it is quieter about which side it takes.
 *
 * <p>The whole question this class exists to settle is what that write can
 * reach. A business may now UPDATE a row it could not touch at all, and the
 * thing that keeps it to two columns is a column privilege rather than a
 * policy - so the tests that matter most here are the ones that try to write a
 * rating and are refused.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ReviewReplyIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String aBooking(String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"%s"}}
                      """.formatted(BookingFixtures.SALON_OFFERING, phone))
                .when().post("/v1/providers/salon-fatou/appointments")
                .then().statusCode(201).extract().path("reference");
    }

    /** Ended and served, which is the only state a review is owed for. */
    private void served(String reference) {
        fixtures.execute("""
                UPDATE appointments
                   SET status = 'COMPLETED',
                       starts_at     = now() - interval '3 days',
                       ends_at       = now() - interval '3 days' + interval '1 hour',
                       blocked_from  = now() - interval '3 days'
                                       - make_interval(mins => buffer_before_minutes),
                       blocked_until = now() - interval '3 days' + interval '1 hour'
                                       + make_interval(mins => buffer_after_minutes)
                 WHERE public_reference = '%s'
                """.formatted(reference));
    }

    private String aReview(String phone, int rating, String comment) {
        String reference = aBooking(phone);
        served(reference);
        given().contentType("application/json")
                .body("{\"rating\":%d,\"comment\":\"%s\"}".formatted(rating, comment))
                .when().post("/v1/bookings/" + reference + "/review").then().statusCode(200);
        return reference;
    }

    // ---------------------------------------------------------------------
    // What a business may say
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("A business reads its own reviews and answers one")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void aBusinessAnswers() {
        aReview("622100001", 2, "Trop long.");

        String id = given().when().get("/v1/reviews").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].rating", equalTo(2))
                .body("data[0].comment", equalTo("Trop long."))
                .body("data[0].status", equalTo("VISIBLE"))
                .body("data[0].reply", nullValue())
                .extract().path("data[0].review_id");

        given().contentType("application/json")
                .body("{\"reply\":\"Vous avez raison, nous avions du retard ce matin-la.\"}")
                .when().post("/v1/reviews/" + id + "/reply").then().statusCode(200)
                .body("reply", equalTo("Vous avez raison, nous avions du retard ce matin-la."))
                // The review itself is untouched by an answer to it.
                .body("rating", equalTo(2))
                .body("comment", equalTo("Trop long."));

        // And a stranger reads the answer under the review, never beside it.
        given().when().get("/v1/providers/salon-fatou/reviews").then().statusCode(200)
                .body("data[0].rating", equalTo(2))
                .body("data[0].reply",
                      equalTo("Vous avez raison, nous avions du retard ce matin-la."));
    }

    @Test
    @DisplayName("Answering again replaces it, and it can be taken back")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void anAnswerIsItsAuthorsToChange() {
        aReview("622100002", 3, "Correct.");
        String id = given().when().get("/v1/reviews").then().statusCode(200)
                .extract().path("data[0].review_id");

        given().contentType("application/json").body("{\"reply\":\"Merci !\"}")
                .when().post("/v1/reviews/" + id + "/reply").then().statusCode(200);
        given().contentType("application/json").body("{\"reply\":\"Merci beaucoup.\"}")
                .when().post("/v1/reviews/" + id + "/reply").then().statusCode(200)
                .body("reply", equalTo("Merci beaucoup."));

        // One review, one answer: replacing, not appending.
        given().when().get("/v1/providers/salon-fatou/reviews").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].reply", equalTo("Merci beaucoup."));

        given().when().delete("/v1/reviews/" + id + "/reply").then().statusCode(200)
                .body("reply", nullValue())
                .body("rating", equalTo(3));
        given().when().get("/v1/providers/salon-fatou/reviews").then().statusCode(200)
                .body("data[0].reply", nullValue());
    }

    // ---------------------------------------------------------------------
    // What it still cannot say, which is the point
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("The write that answers cannot reach the rating, the words or the takedown")
    void theAnswerIsConfinedByAColumnGrant() {
        aReview("622100003", 1, "Decu.");

        // The connection a provider's dashboard runs on, with its own tenant
        // bound. A positive control first: three refusals prove nothing until
        // one write proves the connection works at all.
        assertEquals(1, fixtures.writeAsProvider(BookingFixtures.SALON,
                "UPDATE provider_reviews SET reply = 'Merci', replied_at = now()"),
                "the business must be able to answer, or the refusals below mean nothing");

        // An RLS policy admits ROWS and says nothing about columns. What refuses
        // these is `GRANT UPDATE (reply, replied_at)` and the absence of every
        // other column from it.
        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON,
                "UPDATE provider_reviews SET rating = 5") <= 0,
                "a salon must not be able to buy back a star with a reply");
        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON,
                "UPDATE provider_reviews SET comment = 'reecrit'") <= 0,
                "a salon must not be able to rewrite what a customer wrote");
        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON,
                "UPDATE provider_reviews SET status = 'HIDDEN', hidden_at = now()") <= 0,
                "the takedown is the operator's lever, not the salon's");
        // The one that would slip past a check written in Java: a legitimate
        // reply carrying a rating beside it, in one statement.
        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON,
                "UPDATE provider_reviews SET reply = 'ok', replied_at = now(), rating = 5") <= 0,
                "a rating must not travel beside a reply");
        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON,
                "DELETE FROM provider_reviews") <= 0,
                "a salon must not be able to delete a review it dislikes");

        assertEquals(1, fixtures.count(
                "SELECT count(*) FROM provider_reviews WHERE rating = 1 AND status = 'VISIBLE'"));
    }

    @Test
    @DisplayName("A review taken down cannot be answered, and the business is told which")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void anInertReviewTakesNoAnswer() {
        aReview("622100004", 1, "Inacceptable.");
        String id = given().when().get("/v1/reviews").then().statusCode(200)
                .extract().path("data[0].review_id");

        // Taken down in SQL rather than through the operator's route, because
        // this test has to stay in the salon's own security context: the
        // question is what the SALON gets back, and a method that switched
        // identities halfway would answer a different one. An earlier version
        // did exactly that and passed on a 403 that only meant "an operator
        // holds no profile:write".
        fixtures.execute("""
                UPDATE provider_reviews SET status = 'HIDDEN', hidden_at = now()
                 WHERE id = '%s'
                """.formatted(id));

        // The business still SEES it in its own list, so a 404 would be a lie.
        given().when().get("/v1/reviews").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].status", equalTo("HIDDEN"));

        // The UPDATE policy admits VISIBLE rows only, so the write matches
        // nothing - and the difference between "not yours" and "taken down" is
        // said rather than collapsed.
        given().contentType("application/json").body("{\"reply\":\"Laissez-moi repondre.\"}")
                .when().post("/v1/reviews/" + id + "/reply").then().statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));

        // And a review of somebody else is a 404, byte for byte with one that
        // does not exist.
        given().contentType("application/json").body("{\"reply\":\"Bonjour\"}")
                .when().post("/v1/reviews/" + UUID.randomUUID() + "/reply")
                .then().statusCode(404);
    }

    @Test
    @DisplayName("An operator removes an answer and leaves the review standing")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void theReplyHasItsOwnLever() {
        aReview("622100005", 4, "Bien.");
        String id = given().when().get("/v1/admin/reviews").then().statusCode(200)
                .extract().path("data[0].review_id");

        fixtures.execute("""
                UPDATE provider_reviews
                   SET reply = 'Cette cliente ment.', replied_at = now()
                 WHERE id = '%s'
                """.formatted(id));

        given().when().get("/v1/admin/reviews").then().statusCode(200)
                .body("data[0].reply", equalTo("Cette cliente ment."));

        given().when().delete("/v1/admin/reviews/" + id + "/reply").then().statusCode(200)
                .body("reply", nullValue())
                // Hiding was the only lever there was, and it would have removed
                // the CUSTOMER's words to reach the business's.
                .body("rating", equalTo(4))
                .body("comment", equalTo("Bien."))
                .body("status", equalTo("VISIBLE"));

        // Clearing twice is not an error: it is gone either way.
        given().when().delete("/v1/admin/reviews/" + id + "/reply").then().statusCode(200);
        given().when().delete("/v1/admin/reviews/" + UUID.randomUUID() + "/reply")
                .then().statusCode(404);
    }
}
