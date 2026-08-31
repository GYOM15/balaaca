package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
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
 * Work that is handed over rather than waited for.
 *
 * <p>The product could say one thing - "I sit down and I wait" - so an
 * alteration claimed to be a forty-five minute chair, and couture has been in
 * the taxonomy since the day it was seeded. A garage, a phone repairer and a
 * dry cleaner could not be served at all.
 *
 * <p>What is booked is the HANDOVER. The workshop delay is a promise carried by
 * the same appointment, and it never enters the blocked range: the exclusion
 * constraint models one person at one instant, and a tailor sews twelve boubous
 * at once. These tests are mostly about that line.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "catalog:write", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class DropOffIT {

    private static final String BOOK = "/v1/providers/salon-fatou/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    /** A service handed over: ten minutes at the counter, ready in two days. */
    private static String anAlteration() {
        return given().contentType("application/json")
                .body("""
                      {"name":"Retouche ourlet","duration_minutes":10,
                       "turnaround_hours":48,
                       "price":{"amount_minor":50000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(201)
                .body("fulfilment", equalTo("DROP_OFF"))
                .body("turnaround_hours", equalTo(48))
                .extract().path("service_offering_id");
    }

    private static String bookAt(String offering, String at, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Cliente","phone":"%s"}}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF, offering, at, phone))
                .when().post(BOOK).then().statusCode(201)
                .extract().path("reference");
    }

    @Test
    @DisplayName("An on-site service says so, and carries no promise")
    void anOnSiteServiceIsUnchanged() {
        given().when().get("/v1/service-offerings").then().statusCode(200)
                // Tresses, seeded by the fixtures with no turnaround.
                .body("data[0].fulfilment", equalTo("ON_SITE"))
                .body("data[0].turnaround_hours", nullValue());
    }

    @Test
    @DisplayName("A dropped-off job is promised from the moment it is handed over")
    void theBookingCarriesThePromise() {
        String offering = anAlteration();
        // The handover is ten minutes from 10:00, so the promise is 48 hours
        // after 10:10 - derived in the INSERT from what was announced when this
        // was booked, never recomputed later.
        String reference = bookAt(offering, "2026-09-07T10:00:00Z", "622000001");

        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("ready_by", equalTo("2026-09-09T10:10:00Z"))
                .body("ready_at", nullValue());
    }

    @Test
    @DisplayName("The workshop delay never blocks the chair")
    void theDelayIsNotAnOccupation() {
        String offering = anAlteration();
        bookAt(offering, "2026-09-07T10:00:00Z", "622000001");

        // The next slot on the provider's own fifteen-minute grid, on the SAME
        // chair, while the first job sits in the workshop for two days. If the
        // delay had entered blocked_range this would be 409, and a tailor could
        // take one garment every two days.
        bookAt(offering, "2026-09-07T10:15:00Z", "622000002");

        // And the handover itself is still protected. Ten o'clock again: the
        // first handover runs 10:00 to 10:10, and that is exactly the ten
        // minutes the exclusion constraint exists to defend.
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Troisieme","phone":"622000003"}}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF, offering))
                .when().post(BOOK).then()
                .statusCode(409).body("code", equalTo("SLOT_UNAVAILABLE"));
    }

    @Test
    @DisplayName("Saying it is ready is what calls the customer back")
    void readyIsDeclaredAndRead() {
        String offering = anAlteration();
        String reference = bookAt(offering, "2026-09-07T10:00:00Z", "622000001");

        String id = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .extract().path("data[0].appointment_id");

        given().when().post("/v1/appointments/" + id + "/readiness").then().statusCode(200)
                .body("ready_at", notNullValue());

        // The customer's ticket is where it matters: "come back Friday" becomes
        // "it is waiting for you".
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("ready_at", notNullValue());
    }

    @Test
    @DisplayName("Saying it twice keeps the first instant")
    void readyIsIdempotent() {
        String offering = anAlteration();
        bookAt(offering, "2026-09-07T10:00:00Z", "622000001");
        String id = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().extract().path("data[0].appointment_id");

        String first = given().when().post("/v1/appointments/" + id + "/readiness")
                .then().statusCode(200).extract().path("ready_at");

        // The customer was told once. A second tap must not move a fact, and
        // must not be refused either - it is the same answer, not an error.
        given().when().post("/v1/appointments/" + id + "/readiness").then().statusCode(200)
                .body("ready_at", equalTo(first));
    }

    @Test
    @DisplayName("An on-site appointment has nothing to be ready")
    void readinessIsRefusedOnAnOnSiteJob() {
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000009"}}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF,
                                    BookingFixtures.SALON_OFFERING))
                .when().post(BOOK).then().statusCode(201);

        String id = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().extract().path("data[0].appointment_id");

        given().when().post("/v1/appointments/" + id + "/readiness").then()
                .statusCode(422).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("The promise moves, but never before the handover")
    void thePromiseMoves() {
        String offering = anAlteration();
        bookAt(offering, "2026-09-07T10:00:00Z", "622000001");
        String id = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().extract().path("data[0].appointment_id");

        // "The machine broke, it will be Friday."
        given().contentType("application/json")
                .body("{\"ready_by\":\"2026-09-11T17:00:00Z\"}")
                .when().put("/v1/appointments/" + id + "/promise").then().statusCode(200)
                .body("ready_by", equalTo("2026-09-11T17:00:00Z"));

        // Before the garment was even handed over.
        given().contentType("application/json")
                .body("{\"ready_by\":\"2026-09-06T09:00:00Z\"}")
                .when().put("/v1/appointments/" + id + "/promise").then()
                .statusCode(422).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("Moving the handover moves the promise with it")
    void thePromiseFollowsTheHandover() {
        String offering = anAlteration();
        bookAt(offering, "2026-09-07T10:00:00Z", "622000001");
        String id = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().extract().path("data[0].appointment_id");

        // Monday's drop-off moves to Thursday. Before this, the promise stayed
        // on Wednesday - a date BEFORE the handover, which the table forbids -
        // so the move answered 500 and the garment silently stayed on Monday.
        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-10T10:00:00Z\"}")
                .when().post("/v1/appointments/" + id + "/reschedule").then().statusCode(200)
                // Forty-eight hours from the new handover, re-derived from the
                // delay frozen at booking.
                .body("ready_by", equalTo("2026-09-12T10:10:00Z"));
    }

    @Test
    @DisplayName("Moving an on-site appointment still promises nothing")
    void anOnSiteMoveInventsNoPromise() {
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000007"}}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF,
                                    BookingFixtures.SALON_OFFERING))
                .when().post(BOOK).then().statusCode(201);

        String id = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().extract().path("data[0].appointment_id");

        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-10T10:00:00Z\"}")
                .when().post("/v1/appointments/" + id + "/reschedule").then().statusCode(200)
                .body("ready_by", nullValue());
    }
}
