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
 * An employee leaving, with customers still booked with them.
 *
 * <p>`replaceStaffMember` has accepted `active: false` since the team routes
 * were written, and nothing looked at the diary first. A salon that ticked the
 * box on a Friday left every appointment already made with that person pointing
 * at a chair nobody can be assigned to: the customer still held a reference and
 * still turned up, and the only person who knew was the one who ticked the box.
 *
 * <p>The rule composes with what already exists rather than inventing a
 * destructive repair. Cancelling would punish the customer for the salon's
 * staffing; silently moving them would send somebody to a person they did not
 * choose. Both are things the provider can already do deliberately, so the
 * refusal simply makes them choose.
 *
 * <p>Note what these tests do NOT exercise: retiring the last bookable person.
 * That was already refused, by a different rule and for a different reason - a
 * page with nobody on it cannot be published - and a second chair is added here
 * so the two are never confused.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "staff:write", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class StaffDepartureIT {

    private static final UUID LEAVER = UUID.fromString("a2a2a2a2-0000-0000-0000-00000000000b");

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        fixtures.execute("""
                INSERT INTO provider_staff (id, provider_id, display_name, role)
                     VALUES ('%s','%s','Mariama','STAFF');
                INSERT INTO availability_rules
                       (id, provider_id, staff_id, day_of_week, start_time, end_time)
                     SELECT gen_random_uuid(), '%s', '%s', d, '08:00', '20:00'
                       FROM generate_series(1, 6) AS d
                """.formatted(LEAVER, BookingFixtures.SALON,
                              BookingFixtures.SALON, LEAVER));
    }

    private static String bookWithLeaver() {
        return given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(LEAVER, BookingFixtures.SALON_OFFERING))
                .when().post("/v1/providers/salon-fatou/appointments")
                .then().statusCode(201).extract().path("reference");
    }

    private static io.restassured.response.ValidatableResponse retire() {
        return given().contentType("application/json")
                .body("{\"display_name\":\"Mariama\",\"bookable\":false,\"active\":false}")
                .when().put("/v1/staff/" + LEAVER).then();
    }

    @Test
    @DisplayName("Somebody customers are still booked with cannot be retired")
    void theDiaryIsCheckedFirst() {
        bookWithLeaver();

        retire().statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));

        // And nothing was written: the refusal leaves the person exactly as
        // they were, still on the team and still bookable.
        given().when().get("/v1/staff").then().statusCode(200)
                .body("data.find { it.staff_id == '%s' }.active".formatted(LEAVER),
                      equalTo(true));
    }

    @Test
    @DisplayName("Once the diary is clear, they can leave")
    void theRefusalIsNotAWall() {
        bookWithLeaver();
        retire().statusCode(409);

        String appointmentId = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .extract().path("data[0].appointment_id");

        // Cancelling is the provider's own decision, and it tells the customer.
        given().contentType("application/json")
                .body("{\"reason\":\"Mariama quitte le salon\"}")
                .when().post("/v1/appointments/" + appointmentId + "/cancellation")
                .then().statusCode(200);

        retire().statusCode(200).body("active", equalTo(false));
    }

    @Test
    @DisplayName("Work already done is no obstacle")
    void onlyUpcomingWorkCounts() {
        bookWithLeaver();

        // A provider retiring somebody weeks after they stopped coming must not
        // be refused because of appointments that already happened.
        fixtures.execute("""
                UPDATE appointments
                   SET starts_at     = now() - interval '30 days',
                       ends_at       = now() - interval '30 days' + interval '60 minutes',
                       -- The block window is derived, and a CHECK pins the
                       -- derivation, so a fixture that moved only the start
                       -- would be refused by the schema.
                       blocked_from  = now() - interval '30 days'
                                       - make_interval(mins => buffer_before_minutes),
                       blocked_until = now() - interval '30 days' + interval '60 minutes'
                                       + make_interval(mins => buffer_after_minutes)
                 WHERE staff_id = '%s'
                """.formatted(LEAVER));

        retire().statusCode(200).body("active", equalTo(false));
    }

    @Test
    @DisplayName("Correcting the name of somebody who already left is not refused")
    void thereIsNoTransitionToCheck() {
        retire().statusCode(200);
        bookWithLeaverImpossibleNow();

        // status is already DISABLED, so the trigger has nothing to guard.
        given().contentType("application/json")
                .body("{\"display_name\":\"Mariama D.\",\"bookable\":false,\"active\":false}")
                .when().put("/v1/staff/" + LEAVER).then().statusCode(200)
                .body("display_name", equalTo("Mariama D."));
    }

    /**
     * Once retired, the chair cannot be booked at all - which is the whole
     * point, and was not true before: naming a member who had left was accepted
     * straight from the public page, so a salon that retired somebody kept
     * taking appointments for them.
     *
     * <p>404 rather than 422: they are not on the public list, so "no such
     * staff member" is both honest and silent about who works where.
     */
    private static void bookWithLeaverImpossibleNow() {
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T11:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000002"}}
                      """.formatted(LEAVER, BookingFixtures.SALON_OFFERING))
                .when().post("/v1/providers/salon-fatou/appointments")
                .then().statusCode(404);
    }
}
