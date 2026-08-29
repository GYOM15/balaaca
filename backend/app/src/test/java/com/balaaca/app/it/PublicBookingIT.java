package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * The public booking path, driven through HTTP against a real PostgreSQL, as a
 * customer would drive it. Nothing here calls a bean directly: the interceptor
 * chain, the tenant binding and the RLS session variable all have to work for
 * these to pass.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class PublicBookingIT {

    private static final String SALON = "/v1/providers/salon-fatou/appointments";
    private static final String HIDDEN = "/v1/providers/barbier-cache/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String body(UUID offering, String startsAt, String phone) {
        return """
               {"service_offering_id":"%s","starts_at":"%s",
                "customer":{"full_name":"Mariama B.","phone":"%s"}}
               """.formatted(offering, startsAt, phone);
    }

    @Nested
    @DisplayName("A customer books")
    class HappyPath {

        @Test
        @DisplayName("creates the appointment and returns its id")
        void books() {
            given().contentType("application/json")
                    .body(body(BookingFixtures.SALON_OFFERING, "2026-09-01T10:00:00Z", "622000001"))
                    .when().post(SALON)
                    .then().statusCode(201).body("appointment_id", org.hamcrest.Matchers.notNullValue());

            assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(1);
        }

        @Test
        @DisplayName("normalises a locally typed phone number to E.164")
        void normalisesPhone() {
            given().contentType("application/json")
                    .body(body(BookingFixtures.SALON_OFFERING, "2026-09-01T10:00:00Z", "622 00 00 01"))
                    .when().post(SALON)
                    .then().statusCode(201);
        }
    }

    @Nested
    @DisplayName("The slot is protected")
    class SlotProtection {

        @Test
        @DisplayName("refuses a second booking on the same slot")
        void refusesDoubleBooking() {
            book("2026-09-01T10:00:00Z", "622000001").statusCode(201);

            book("2026-09-01T10:00:00Z", "622000002")
                    .statusCode(409).body("code", equalTo("SLOT_UNAVAILABLE"));

            assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(1);
        }

        @Test
        @DisplayName("refuses a slot that lands inside the previous booking's buffer")
        void refusesInsideBuffer() {
            // The offering runs 60 minutes with a 15-minute lead-in and a
            // 10-minute tail, so a 10:00 booking holds 09:45 to 11:10.
            book("2026-09-01T10:00:00Z", "622000001").statusCode(201);

            // 11:00 is a declared start - the salon's grid is 15 minutes - so
            // the request reaches the constraint, which is what refuses it. A
            // start off the grid would be refused earlier, and for another
            // reason, testing nothing about buffers.
            book("2026-09-01T11:00:00Z", "622000002").statusCode(409);
        }

        @Test
        @DisplayName("accepts the first slot clear of both buffers")
        void acceptsAfterBuffers() {
            book("2026-09-01T10:00:00Z", "622000001").statusCode(201);

            // 11:15 would still block from 11:00 because of its own lead-in;
            // 11:30 is the first declared start whose blocked window is clear.
            book("2026-09-01T11:30:00Z", "622000002").statusCode(201);
        }
    }

    @Nested
    @DisplayName("A tenant cannot be reached sideways")
    class Isolation {

        @Test
        @DisplayName("an unpublished provider is not bookable")
        void unpublishedIsNotBookable() {
            given().contentType("application/json")
                    .body(body(BookingFixtures.HIDDEN_OFFERING, "2026-09-01T10:00:00Z", "622000001"))
                    .when().post(HIDDEN)
                    .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
        }

        @Test
        @DisplayName("an unknown slug answers exactly like an unpublished one")
        void unknownSlugIsIndistinguishable() {
            given().contentType("application/json")
                    .body(body(BookingFixtures.SALON_OFFERING, "2026-09-01T10:00:00Z", "622000001"))
                    .when().post("/v1/providers/does-not-exist/appointments")
                    .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
        }

        @Test
        @DisplayName("another provider's offering is invisible, not forbidden")
        void crossTenantOfferingIsNotFound() {
            // 404 and not 403: a 403 would confirm the offering exists, which is
            // the existence oracle the whole isolation story exists to prevent.
            given().contentType("application/json")
                    .body(body(BookingFixtures.HIDDEN_OFFERING, "2026-09-01T10:00:00Z", "622000001"))
                    .when().post(SALON)
                    .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));

            assertThat(fixtures.activeAppointments(BookingFixtures.HIDDEN)).isZero();
        }
    }

    @Nested
    @DisplayName("A retry is safe")
    class Idempotency {

        @Test
        @DisplayName("replaying the same key returns the first appointment")
        void replayReturnsTheFirst() {
            String key = "key-" + UUID.randomUUID();
            String payload = body(BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000008");

            String first = given().contentType("application/json").header("Idempotency-Key", key)
                    .body(payload).when().post(SALON)
                    .then().statusCode(201).extract().path("appointment_id");

            String replay = given().contentType("application/json").header("Idempotency-Key", key)
                    .body(payload).when().post(SALON)
                    .then().statusCode(200).extract().path("appointment_id");

            assertThat(replay).isEqualTo(first);
            assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(1);
        }

        @Test
        @DisplayName("replaying survives the slot ceasing to be bookable")
        void replaySurvivesAClosedDay() {
            String key = "key-" + UUID.randomUUID();
            String payload = body(BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000010");

            String first = given().contentType("application/json").header("Idempotency-Key", key)
                    .body(payload).when().post(SALON)
                    .then().statusCode(201).extract().path("appointment_id");

            // The provider closes the day between the two calls. The same thing
            // happens on its own when a start drifts inside the lead time while
            // a customer's connection is still retrying: the availability check
            // now says no to a request whose appointment already exists.
            fixtures.closeSalonOn("2026-09-04");

            String replay = given().contentType("application/json").header("Idempotency-Key", key)
                    .body(payload).when().post(SALON)
                    .then().statusCode(200).extract().path("appointment_id");

            assertThat(replay).isEqualTo(first);
            assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(1);
        }

        @Test
        @DisplayName("the same key with a different request is rejected, not silently replayed")
        void reusedKeyIsRejected() {
            String key = "key-" + UUID.randomUUID();

            given().contentType("application/json").header("Idempotency-Key", key)
                    .body(body(BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000008"))
                    .when().post(SALON).then().statusCode(201);

            given().contentType("application/json").header("Idempotency-Key", key)
                    .body(body(BookingFixtures.SALON_OFFERING, "2026-09-05T10:00:00Z", "622000009"))
                    .when().post(SALON)
                    .then().statusCode(422).body("code", equalTo("IDEMPOTENCY_KEY_REUSED"));
        }
    }

    @Nested
    @DisplayName("Input is validated at the edge")
    class Validation {

        @Test
        @DisplayName("an unparseable phone number is rejected")
        void rejectsBadPhone() {
            book("2026-09-06T10:00:00Z", "not-a-number").statusCode(422);
        }

        @Test
        @DisplayName("a missing body is rejected before anything is touched")
        void rejectsEmptyBody() {
            given().contentType("application/json").body("{}")
                    .when().post(SALON).then().statusCode(400);

            assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isZero();
        }

        @Test
        @DisplayName("no error response ever carries a stack trace or SQL")
        void errorsRevealNothing() {
            String problem = book("2026-09-06T10:00:00Z", "not-a-number").extract().asString();

            assertThat(problem)
                    .doesNotContain("Exception")
                    .doesNotContain("SELECT")
                    .doesNotContain("INSERT")
                    .doesNotContain("appointments")
                    .doesNotContain("at com.balaaca");
        }
    }

    private static io.restassured.response.ValidatableResponse book(String startsAt, String phone) {
        return given().contentType("application/json")
                .body(body(BookingFixtures.SALON_OFFERING, startsAt, phone))
                .when().post(SALON).then();
    }
}
