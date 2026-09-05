package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The other half of a directory.
 *
 * <p>A hub that lists businesses and carries no opinion of them is a telephone
 * book. What makes the opinion worth reading is who is allowed to write it: a
 * review is reached by the booking reference and never by a public slug,
 * because in this market a salon's competitor is three streets away and knows
 * the handle - an open review form is a button they can press from a script,
 * and a five-star form is a button the salon can press.
 *
 * <p>The other half of that design is who may CHANGE one. A business reads its
 * own reviews and cannot write, edit or delete a single one, and that is
 * enforced by the absence of a policy rather than by an application that
 * remembers - which is exactly the kind of thing worth a test that would notice
 * it coming back.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ReviewIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    // ---------------------------------------------------------------------
    // Decor
    // ---------------------------------------------------------------------

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

    /**
     * Moves a booking into the past, which is the only state a review is owed
     * for.
     *
     * <p>Against PostgreSQL's {@code now()} and not the pinned application
     * clock, deliberately: eligibility is decided by {@code app_may_review},
     * which the database evaluates.
     *
     * <p>The block window is DERIVED from the row's own frozen buffers rather
     * than guessed at, because `ck_appointments_block_derived` pins it to
     * exactly that - the schema is what guarantees the application computed the
     * window correctly, and a fixture is not exempt from it.
     */
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

    private static byte[] photo() {
        BufferedImage image = new BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpeg", out);
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
        return out.toByteArray();
    }

    private static io.restassured.response.ValidatableResponse review(String reference, String body) {
        return given().contentType("application/json").body(body)
                .when().post("/v1/bookings/" + reference + "/review").then();
    }

    private static io.restassured.response.ValidatableResponse illustrate(String reference) {
        return given().contentType("image/jpeg").body(photo())
                .when().post("/v1/bookings/" + reference + "/review/photos").then();
    }

    // ---------------------------------------------------------------------
    // What a customer can say
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Somebody who was served leaves stars, a sentence and a photograph")
    void aCustomerSaysHowItWent() {
        String reference = aBooking("622000001");
        served(reference);

        review(reference, """
               {"rating":5,"comment":"Impeccable, je reviendrai."}
               """).statusCode(200)
                .body("rating", equalTo(5))
                .body("comment", equalTo("Impeccable, je reviendrai."))
                .body("service_name", equalTo("Tresses"))
                // The month, never the day. Public availability publishes
                // bookable slots, so a gap in them plus an exact date names one
                // person at a one-chair salon.
                .body("visited_month", org.hamcrest.Matchers.matchesRegex("\\d{4}-\\d{2}"))
                .body("status", equalTo("VISIBLE"))
                .body("photos", hasSize(0));

        illustrate(reference).statusCode(201)
                .body("photos", hasSize(1))
                .body("photos[0].position", equalTo(0))
                // A name minted by the store: not the customer, not the
                // original filename, and no coordinates - the sanitiser
                // re-encodes, which is what drops what a telephone writes.
                .body("photos[0].url", startsWith("/v1/media/"));
    }

    @Test
    @DisplayName("The booking carries what its own customer said, and whether they still may")
    void thePageKnowsWithoutAsking() {
        String reference = aBooking("622000002");

        // Before the visit: no review, and the form must not be offered.
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("reviewable", equalTo(false))
                .body("review", nullValue());

        served(reference);
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("reviewable", equalTo(true))
                .body("review", nullValue());

        review(reference, "{\"rating\":4}").statusCode(200);
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("reviewable", equalTo(true))
                .body("review.rating", equalTo(4))
                // Stars with nothing written is a real answer, and it is not an
                // empty quotation mark.
                .body("review.comment", nullValue());
    }

    @Test
    @DisplayName("Sending it again corrects it rather than posting a second one")
    void amendingReplaces() {
        String reference = aBooking("622000003");
        served(reference);

        review(reference, "{\"rating\":2,\"comment\":\"Trop long.\"}").statusCode(200);
        review(reference, "{\"rating\":4,\"comment\":\"Corrige: c'etait bien.\"}").statusCode(200)
                .body("rating", equalTo(4));

        // One review, not two: the same person on the same visit, with a
        // corrected opinion. A public typo its author cannot fix is worse than
        // the branch it costs.
        given().when().get("/v1/providers/salon-fatou/reviews").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].rating", equalTo(4));
    }

    @Test
    @DisplayName("Three photographs, and the fourth is refused with a sentence")
    void theCapIsAPromiseAboutThePage() {
        String reference = aBooking("622000004");
        served(reference);
        review(reference, "{\"rating\":5}").statusCode(200);

        for (int i = 0; i < 3; i++) {
            illustrate(reference).statusCode(201);
        }
        illustrate(reference).statusCode(422)
                .body("code", equalTo("VALIDATION_FAILED"));

        String photoId = given().when().get("/v1/bookings/" + reference)
                .then().statusCode(200).extract().path("review.photos[1].photo_id");

        given().when().delete("/v1/bookings/" + reference + "/review/photos/" + photoId)
                .then().statusCode(200).body("photos", hasSize(2))
                // The freed slot is not backfilled: renumbering would move the
                // others, and the first is the one a list shows.
                .body("photos[0].position", equalTo(0))
                .body("photos[1].position", equalTo(2));

        illustrate(reference).statusCode(201).body("photos", hasSize(3));
    }

    // ---------------------------------------------------------------------
    // What nobody can say
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("A reference nobody holds reviews nothing")
    void aStrangerCannotReview() {
        // The capability is the guard, and it is the whole reason a star here
        // means more than a star on a form anybody can fill in.
        review("SFA-7K2MQP", "{\"rating\":5}").statusCode(404);
    }

    @Test
    @DisplayName("A visit that has not happened cannot be reviewed")
    void nothingToReviewYet() {
        String reference = aBooking("622000005");
        review(reference, "{\"rating\":5}").statusCode(409)
                .body("code", equalTo("INVALID_STATE_TRANSITION"));
    }

    @Test
    @DisplayName("A cancelled booking cannot be reviewed, and cancelling withdraws the offer")
    void aCancelledVisitIsNotAVisit() {
        String reference = aBooking("622000006");
        served(reference);
        // cancelled_at and cancelled_by travel with the status: the schema
        // refuses a cancellation that does not say when or by whom, which is
        // why this is not a one-column update.
        fixtures.execute("""
                UPDATE appointments
                   SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'CUSTOMER'
                 WHERE public_reference = '%s'
                """.formatted(reference));

        review(reference, "{\"rating\":1}").statusCode(409);
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("reviewable", equalTo(false));
    }

    @Test
    @DisplayName("Stars outside one to five are refused before they reach the table")
    void aStarIsOneToFive() {
        String reference = aBooking("622000007");
        served(reference);
        review(reference, "{\"rating\":0}").statusCode(400);
        review(reference, "{\"rating\":6}").statusCode(400);
    }

    // ---------------------------------------------------------------------
    // What the business cannot do, which is the point
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("A business cannot write, raise or delete a review of itself")
    void theRatedIsNotTheRater() {
        String reference = aBooking("622000008");
        served(reference);
        review(reference, "{\"rating\":1,\"comment\":\"Decu.\"}").statusCode(200);

        // A SECOND booking, with no review, so the insert below is refused for
        // the right reason. Aimed at the reviewed appointment it would collide
        // with UNIQUE (appointment_id) and pass while proving nothing.
        String unreviewed = aBooking("622000009");
        served(unreviewed);

        // A positive control first, because three assertions that something
        // failed prove nothing until one proves the connection works at all.
        // Same role, same binding, a write the salon IS allowed.
        assertEquals(1, fixtures.writeAsProvider(BookingFixtures.SALON,
                "UPDATE providers SET description = 'ouvert' WHERE id = '"
                + BookingFixtures.SALON + "'"),
                "the helper itself must be able to write, or the refusals below mean nothing");

        // Now the refusals, on the connection a provider's dashboard actually
        // runs on. There is no route that does any of this, and the reason
        // there can never be one is that the role cannot.
        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON, """
                INSERT INTO provider_reviews
                    (id, provider_id, appointment_id, rating, service_name, visited_month)
                SELECT gen_random_uuid(), a.provider_id, a.id, 5, 'Tresses',
                       date_trunc('month', now())::date
                  FROM appointments a
                 WHERE a.public_reference = '%s'
                """.formatted(unreviewed)) <= 0,
                "a salon must not be able to post its own five stars");

        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON,
                "UPDATE provider_reviews SET rating = 5") <= 0,
                "a salon must not be able to turn a one into a five");

        assertTrue(fixtures.writeAsProvider(BookingFixtures.SALON,
                "DELETE FROM provider_reviews") <= 0,
                "a salon must not be able to delete a review it dislikes");

        // Still exactly one review, still one star.
        assertEquals(1, fixtures.count("SELECT count(*) FROM provider_reviews WHERE rating = 1"));
    }

    // ---------------------------------------------------------------------
    // What the hub shows
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("The stars reach the page and the card, and both print one figure")
    void theHubCarriesTheOpinion() {
        String first = aBooking("622000011");
        served(first);
        review(first, "{\"rating\":5,\"comment\":\"Parfait.\"}").statusCode(200);

        String second = aBooking("622000012");
        served(second);
        review(second, "{\"rating\":4}").statusCode(200);

        // 4.5, rounded once in SQL, so the two surfaces cannot disagree.
        given().when().get("/v1/providers/salon-fatou").then().statusCode(200)
                .body("rating.average", equalTo(4.5f))
                .body("rating.count", equalTo(2));

        given().when().get("/v1/providers?q=fatou").then().statusCode(200)
                .body("data[0].rating.average", equalTo(4.5f))
                .body("data[0].rating.count", equalTo(2));

        given().when().get("/v1/providers/salon-fatou/reviews").then().statusCode(200)
                .body("data", hasSize(2))
                // Newest first, and no reviewer named anywhere in the payload.
                .body("data[0].service_name", equalTo("Tresses"))
                .body("next_cursor", nullValue());
    }

    @Test
    @DisplayName("A business nobody has reviewed has no rating, and not nought out of five")
    void absentIsNotZero() {
        given().when().get("/v1/providers/salon-fatou").then().statusCode(200)
                .body("rating", nullValue());
        given().when().get("/v1/providers?q=fatou").then().statusCode(200)
                .body("data[0].rating", nullValue());
    }

    // ---------------------------------------------------------------------
    // The lever
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("An operator takes a review down, and it leaves the page and the average together")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void theOperatorHoldsTheOnlyLever() {
        String reference = aBooking("622000013");
        served(reference);
        review(reference, "{\"rating\":1,\"comment\":\"Inacceptable.\"}").statusCode(200);

        String id = given().when().get("/v1/admin/reviews").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].provider_slug", equalTo("salon-fatou"))
                .body("data[0].rating", equalTo(1))
                .body("data[0].status", equalTo("VISIBLE"))
                .body("data[0].photo_count", equalTo(0))
                .extract().path("data[0].review_id");

        given().contentType("application/json").body("{\"hidden\":true}")
                .when().post("/v1/admin/reviews/" + id + "/visibility").then().statusCode(200)
                .body("status", equalTo("HIDDEN"))
                .body("hidden_at", notNullValue());

        // One rule decides what is published, so the list, the count and the
        // average cannot disagree about it.
        given().when().get("/v1/providers/salon-fatou/reviews").then().statusCode(200)
                .body("data", hasSize(0));
        given().when().get("/v1/providers/salon-fatou").then().statusCode(200)
                .body("rating", nullValue());

        // Terminal: amending is not the way back out of moderation.
        review(reference, "{\"rating\":5,\"comment\":\"Laissez-moi revenir.\"}").statusCode(409);

        // And its author is told, rather than left to think the site is broken.
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("review.status", equalTo("HIDDEN"))
                .body("reviewable", equalTo(false));

        given().contentType("application/json").body("{\"hidden\":false}")
                .when().post("/v1/admin/reviews/" + id + "/visibility").then().statusCode(200)
                .body("status", equalTo("VISIBLE"))
                .body("hidden_at", nullValue());

        given().when().get("/v1/providers/salon-fatou/reviews").then().statusCode(200)
                .body("data", hasSize(1));

        given().contentType("application/json").body("{\"hidden\":true}")
                .when().post("/v1/admin/reviews/" + UUID.randomUUID() + "/visibility")
                .then().statusCode(404);
    }

    @Test
    @DisplayName("A business cannot work the review queue")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theRatedDoesNotModerate() {
        given().when().get("/v1/admin/reviews").then().statusCode(403);
    }
}
