package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import jakarta.inject.Inject;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A provider declaring when they are open, and the booking path obeying it.
 *
 * <p>The last assertion is the one that matters: hours are not a display
 * concern. What a provider writes here decides what a stranger can take.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "schedule:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class ScheduleIT {

    private static final String STAFF = "a1a1a1a1-0000-0000-0000-000000000001";
    private static final String BOOKING = "/v1/providers/salon-fatou/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static io.restassured.response.ValidatableResponse book(String startsAt, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Mariama B.","phone":"%s"}}
                      """.formatted(BookingFixtures.SALON_OFFERING, startsAt, phone))
                .when().post(BOOKING).then();
    }

    @Test
    @DisplayName("A provider lists their own people and nobody else's")
    void listsStaff() {
        given().when().get("/v1/staff").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].display_name", equalTo("Fatou"));
    }

    @Test
    @DisplayName("The hours come back with the zone they are written in")
    void readsHoursWithTheirZone() {
        given().queryParam("staff_id", STAFF).when().get("/v1/opening-hours")
                .then().statusCode(200)
                .body("timezone", equalTo("Africa/Conakry"))
                // Monday to Saturday, seeded.
                .body("data", hasSize(6));
    }

    @Test
    @DisplayName("Replacing the week replaces it whole")
    void replacesTheWholeWeek() {
        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","data":[
                        {"day_of_week":5,"start_time":"09:00","end_time":"12:00"},
                        {"day_of_week":5,"start_time":"14:00","end_time":"18:00"}]}
                      """.formatted(STAFF))
                .when().put("/v1/opening-hours").then().statusCode(200)
                .body("data", hasSize(2));

        // The days nobody mentioned are gone, which is what "replace" has to
        // mean: a per-day edit would leave them ambiguous.
        List<Integer> days = given().queryParam("staff_id", STAFF)
                .when().get("/v1/opening-hours").then().statusCode(200)
                .extract().jsonPath().getList("data.day_of_week", Integer.class);
        assertThat(days).containsExactly(5, 5);
    }

    @Test
    @DisplayName("New hours decide what a stranger can still book")
    void hoursGovernBooking() {
        // 2026-09-04 is a Friday. Ten in the morning is inside the seeded week.
        book("2026-09-04T10:00:00Z", "622000001").statusCode(201);

        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","data":[
                        {"day_of_week":5,"start_time":"14:00","end_time":"18:00"}]}
                      """.formatted(STAFF))
                .when().put("/v1/opening-hours").then().statusCode(200);

        // The morning is outside the declared hours now, and the afternoon is
        // not. What was already booked stays booked - hours decide what can
        // still be taken, never what already was.
        book("2026-09-04T10:00:00Z", "622000002")
                .statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));
        book("2026-09-04T15:00:00Z", "622000003").statusCode(201);
        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(2);
    }

    @Test
    @DisplayName("A window of no length is refused, and says which day")
    void refusesAnEmptyWindow() {
        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","data":[
                        {"day_of_week":3,"start_time":"09:00","end_time":"09:00"}]}
                      """.formatted(STAFF))
                .when().put("/v1/opening-hours").then()
                .statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A closure empties a day, and removing it gives the day back")
    void closesAndReopensADay() {
        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","date":"2026-09-04","kind":"CLOSED","reason":"ferie"}
                      """.formatted(STAFF))
                .when().post("/v1/closures").then().statusCode(201)
                .body("kind", equalTo("CLOSED"));

        book("2026-09-04T10:00:00Z", "622000004")
                .statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));

        String id = given().queryParam("staff_id", STAFF)
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-30")
                .when().get("/v1/closures").then().statusCode(200)
                .body("data", hasSize(1))
                .extract().path("data[0].closure_id");

        given().when().delete("/v1/closures/" + id).then().statusCode(204);

        book("2026-09-04T10:00:00Z", "622000005").statusCode(201);
    }

    @Test
    @DisplayName("A day with different hours replaces the week's, it does not add to it")
    void customHoursReplaceTheWeek() {
        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","date":"2026-09-04","kind":"CUSTOM_HOURS",
                       "start_time":"14:00","end_time":"17:00"}
                      """.formatted(STAFF))
                .when().post("/v1/closures").then().statusCode(201);

        book("2026-09-04T10:00:00Z", "622000006").statusCode(422);
        book("2026-09-04T15:00:00Z", "622000007").statusCode(201);
    }

    @Test
    @DisplayName("A closed day carrying times is refused before it is stored")
    void refusesAMalformedClosure() {
        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","date":"2026-09-04","kind":"CLOSED",
                       "start_time":"09:00","end_time":"12:00"}
                      """.formatted(STAFF))
                .when().post("/v1/closures").then()
                .statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("Another provider's staff member is not found, not forbidden")
    void cannotReachAnotherProvidersStaff() {
        // coiffeur-solo's owner. Invisible to this caller, so the same answer as
        // a staff member who never existed.
        given().queryParam("staff_id", "c3c3c3c3-0000-0000-0000-000000000001")
                .when().get("/v1/opening-hours").then()
                .statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("Reading the schedule does not grant setting it")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesWithoutTheWriteScope() {
        given().contentType("application/json")
                .body("""
                      {"staff_id":"%s","data":[]}
                      """.formatted(STAFF))
                .when().put("/v1/opening-hours").then().statusCode(403);
    }
}
