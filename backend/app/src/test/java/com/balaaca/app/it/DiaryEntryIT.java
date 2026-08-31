package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import io.restassured.response.ValidatableResponse;
import jakarta.inject.Inject;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A provider writing in the diary rather than reading it.
 *
 * <p>Three things a salon does every day and could not express. Somebody walks
 * in and the appointment has to be recorded, whatever the published hours say
 * about strangers. A colleague is away from two to three, which was neither a
 * closure nor a change of hours and so could only be said by closing the whole
 * day. And work gets reassigned - somebody calls in sick, a regular asks for a
 * particular pair of hands - which the reschedule route could not do because it
 * moved only the time.
 *
 * <p>What none of them may do is put two people in one chair at one time. Every
 * waiver below stops at that line, and the last tests are there to prove it.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "schedule:write", "appointments:write", "profile:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class DiaryEntryIT {

    private static final UUID SECOND_CHAIR =
            UUID.fromString("a8a8a8a8-0000-0000-0000-000000000001");
    private static final String OWNER_CHAIR = BookingFixtures.SALON_OWNER_STAFF.toString();

    private static final String PUBLIC_BOOKING = "/v1/providers/salon-fatou/appointments";
    private static final String COUNTER = "/v1/appointments";

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
                """.formatted(SECOND_CHAIR, BookingFixtures.SALON,
                              BookingFixtures.SALON, SECOND_CHAIR));
    }

    private static String body(String staffId, String startsAt, String phone) {
        String staff = staffId == null ? "" : "\"staff_id\":\"" + staffId + "\",";
        return """
               {%s"service_offering_id":"%s","starts_at":"%s",
                "customer":{"full_name":"Cliente","phone":"%s"}}
               """.formatted(staff, BookingFixtures.SALON_OFFERING, startsAt, phone);
    }

    /** What a stranger on the public page can do. */
    private static ValidatableResponse asCustomer(String staffId, String at, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(body(staffId, at, phone))
                .when().post(PUBLIC_BOOKING).then();
    }

    /** What the salon can write into its own book. */
    private static ValidatableResponse atTheCounter(String staffId, String at, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(body(staffId, at, phone))
                .when().post(COUNTER).then();
    }

    private static String appointmentAt(String staffId, String at, String phone) {
        return atTheCounter(staffId, at, phone).statusCode(201)
                .extract().path("appointment_id");
    }

    @Test
    @DisplayName("The counter can write in an hour the public page refuses")
    void theCounterIsNotBoundByThePublishedHours() {
        // The salon closes at eight. A customer is told so.
        asCustomer(OWNER_CHAIR, "2026-09-07T21:00:00Z", "622000001")
                .statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));

        // The provider staying late and writing it down is not a customer.
        atTheCounter(OWNER_CHAIR, "2026-09-07T21:00:00Z", "622000001").statusCode(201);
    }

    @Test
    @DisplayName("The counter can write inside the notice a customer owes")
    void theCounterIsNotBoundByTheNoticePeriod() {
        given().contentType("application/json")
                .body("""
                      {"slot_granularity_minutes":15,"min_lead_time_minutes":20160,
                       "max_advance_days":60,"cancellation_deadline_minutes":120,
                       "auto_confirm":false}
                      """)
                .when().put("/v1/booking-policy").then().statusCode(200);

        // Two weeks' notice, so next Monday is too soon for a stranger.
        asCustomer(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000002")
                .statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));

        // The person standing at the counter owes nobody notice.
        atTheCounter(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000002").statusCode(201);
    }

    @Test
    @DisplayName("A counter entry is already accepted, even at a salon that vets bookings")
    void theCounterEntryArrivesConfirmed() {
        // salon-fatou has auto_confirm false, so a stranger's booking waits.
        asCustomer(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000003")
                .statusCode(201).body("status", equalTo("PENDING"));

        // Leaving this one PENDING would put the salon's own entry in the
        // salon's own queue, waiting for itself.
        atTheCounter(OWNER_CHAIR, "2026-09-07T12:00:00Z", "622000004")
                .statusCode(201).body("status", equalTo("CONFIRMED"));
    }

    @Test
    @DisplayName("The counter waives every rule but the one that matters")
    void theCounterCannotDoubleBook() {
        asCustomer(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000005").statusCode(201);

        atTheCounter(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000006")
                .statusCode(409).body("code", equalTo("SLOT_UNAVAILABLE"));
    }

    @Test
    @DisplayName("A retried counter entry does not burn a second chair")
    void theCounterEntryIsIdempotent() {
        String key = "counter-" + UUID.randomUUID();
        String first = given().contentType("application/json").header("Idempotency-Key", key)
                .body(body(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000007"))
                .when().post(COUNTER).then().statusCode(201)
                .extract().path("appointment_id");

        given().contentType("application/json").header("Idempotency-Key", key)
                .body(body(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000007"))
                .when().post(COUNTER).then().statusCode(200)
                .body("appointment_id", equalTo(first));
    }

    @Test
    @DisplayName("An appointment moves from one chair to another")
    void movesBetweenChairs() {
        String id = appointmentAt(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000008");

        given().contentType("application/json")
                .body("""
                      {"starts_at":"2026-09-07T10:00:00Z","staff_id":"%s"}
                      """.formatted(SECOND_CHAIR))
                .when().post("/v1/appointments/" + id + "/reschedule").then().statusCode(200)
                .body("staff_id", equalTo(SECOND_CHAIR.toString()))
                .body("staff_name", equalTo("Mariama"));

        // The old chair is genuinely released in the same statement: it takes
        // the same hour again, which it could not do if the row still held it.
        atTheCounter(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000009").statusCode(201);
    }

    @Test
    @DisplayName("A chair that is already busy refuses the appointment moved onto it")
    void refusesAMoveOntoABusyChair() {
        String id = appointmentAt(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000010");
        appointmentAt(SECOND_CHAIR.toString(), "2026-09-07T10:00:00Z", "622000011");

        given().contentType("application/json")
                .body("""
                      {"starts_at":"2026-09-07T10:00:00Z","staff_id":"%s"}
                      """.formatted(SECOND_CHAIR))
                .when().post("/v1/appointments/" + id + "/reschedule").then()
                .statusCode(409).body("code", equalTo("SLOT_UNAVAILABLE"));
    }

    @Test
    @DisplayName("A chair at another salon is a chair that does not exist")
    void refusesAMoveOntoAStrangersChair() {
        String id = appointmentAt(OWNER_CHAIR, "2026-09-07T10:00:00Z", "622000012");

        given().contentType("application/json")
                .body("""
                      {"starts_at":"2026-09-07T10:00:00Z",
                       "staff_id":"c3c3c3c3-0000-0000-0000-000000000001"}
                      """)
                .when().post("/v1/appointments/" + id + "/reschedule").then()
                .statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("A day can be split into two windows and both of them open")
    void bothExceptionalWindowsApply() {
        closure("CUSTOM_HOURS", "\"start_time\":\"08:00\",\"end_time\":\"10:00\",");
        closure("CUSTOM_HOURS", "\"start_time\":\"16:00\",\"end_time\":\"18:00\",");

        List<String> starts = slotsOn("2026-09-07");

        // The second row used to be accepted with 201 and then dropped: the
        // reader took the first override it found for the date.
        assertContains(starts, "2026-09-07T08:00:00Z");
        assertContains(starts, "2026-09-07T16:00:00Z");
        // And the replaced weekly hours are still replaced.
        given().queryParam("staff_id", OWNER_CHAIR)
                .queryParam("service_offering_id", BookingFixtures.SALON_OFFERING)
                .queryParam("from", "2026-09-07").queryParam("to", "2026-09-07")
                .when().get("/v1/providers/salon-fatou/available-slots").then()
                .body("data.starts_at", not(hasItem("2026-09-07T12:00:00Z")));
    }

    @Test
    @DisplayName("An hour away takes an hour, not the whole day")
    void anAbsenceTakesOnlyItsOwnWindow() {
        closure("TIME_OFF", "\"start_time\":\"14:00\",\"end_time\":\"15:00\",");

        List<String> starts = slotsOn("2026-09-07");

        // The day is still the ordinary day - which closing it would not be,
        // and which is the only thing that could be said before.
        assertContains(starts, "2026-09-07T09:00:00Z");
        assertContains(starts, "2026-09-07T16:00:00Z");
        org.assertj.core.api.Assertions.assertThat(starts)
                .doesNotContain("2026-09-07T14:00:00Z");

        // And it binds the booking path, not only the list.
        asCustomer(OWNER_CHAIR, "2026-09-07T14:00:00Z", "622000013")
                .statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));
    }

    @Test
    @DisplayName("An absence is read back as an absence, not as extra opening hours")
    void anAbsenceKeepsItsKind() {
        closure("TIME_OFF", "\"start_time\":\"14:00\",\"end_time\":\"15:00\",");

        given().queryParam("staff_id", OWNER_CHAIR)
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-30")
                .when().get("/v1/closures").then().statusCode(200)
                .body("data", hasSize(1))
                // Inferred from the presence of times, it would have come back
                // as CUSTOM_HOURS - the exact opposite of what it means.
                .body("data[0].kind", equalTo("TIME_OFF"));
    }

    private static void closure(String kind, String times) {
        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","date":"2026-09-07",%s"kind":"%s"}
                      """.formatted(OWNER_CHAIR, times, kind))
                .when().post("/v1/closures").then().statusCode(201);
    }

    private static List<String> slotsOn(String date) {
        return given().queryParam("staff_id", OWNER_CHAIR)
                .queryParam("service_offering_id", BookingFixtures.SALON_OFFERING)
                .queryParam("from", date).queryParam("to", date)
                .when().get("/v1/providers/salon-fatou/available-slots").then().statusCode(200)
                .extract().jsonPath().getList("data.starts_at", String.class);
    }

    private static void assertContains(List<String> starts, String instant) {
        org.assertj.core.api.Assertions.assertThat(starts).contains(instant);
    }
}
