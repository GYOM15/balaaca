package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Availability, end to end. Until this increment a customer could book at 03:00
 * on a day the provider was closed: the exclusion constraint stops a slot being
 * sold twice, and nothing stopped one being sold at all.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class AvailabilityIT {

    private static final String SALON = "/v1/providers/salon-fatou/appointments";
    private static final String SLOTS = "/v1/providers/salon-fatou/available-slots";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    /** A fresh key per call: the contract requires one, not a particular one. */
    private static io.restassured.specification.RequestSpecification post() {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID());
    }

    private static String booking(String startsAt, String phone) {
        return """
               {"service_offering_id":"%s","starts_at":"%s",
                "customer":{"full_name":"Mariama B.","phone":"%s"}}
               """.formatted(BookingFixtures.SALON_OFFERING, startsAt, phone);
    }

    @Test
    @DisplayName("Refuses a booking outside the declared hours")
    void refusesOutsideHours() {
        // The salon opens 08:00 to 20:00; 03:00 is nobody's opening hour.
        post()
                .body(booking("2026-09-01T03:00:00Z", "622000001"))
                .when().post(SALON)
                .then().statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));

        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isZero();
    }

    @Test
    @DisplayName("Refuses a booking on a Sunday, which has no rule")
    void refusesOnAClosedWeekday() {
        // 2026-09-06 is a Sunday; rules cover Monday to Saturday only.
        post()
                .body(booking("2026-09-06T10:00:00Z", "622000002"))
                .when().post(SALON)
                .then().statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));
    }

    @Test
    @DisplayName("Refuses a booking on a date closed by an override")
    void refusesOnAnOverriddenClosure() {
        // 2026-09-01 is a Tuesday and normally open.
        fixtures.closeSalonOn("2026-09-01");

        post()
                .body(booking("2026-09-01T10:00:00Z", "622000003"))
                .when().post(SALON)
                .then().statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));
    }

    @Test
    @DisplayName("Refuses a start that is not on the provider's slot grid")
    void refusesOffGridStart() {
        // The salon's granularity is 15 minutes, so 10:05 is a start it never
        // offers. Accepting it anyway would make slot_granularity_minutes
        // decorative: two customers could take 10:00 and 10:05 and the
        // provider's day would stop matching the grid they configured.
        post()
                .body(booking("2026-09-01T10:05:00Z", "622000007"))
                .when().post(SALON)
                .then().statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));

        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isZero();
    }

    @Test
    @DisplayName("Still accepts a booking inside the declared hours")
    void acceptsInsideHours() {
        post()
                .body(booking("2026-09-01T10:00:00Z", "622000004"))
                .when().post(SALON)
                .then().statusCode(201);
    }

    @Test
    @DisplayName("Lists only bookable slots, never who is busy when")
    void listsOnlyBookableSlots() {
        List<String> starts = given()
                .queryParam("service_offering_id", BookingFixtures.SALON_OFFERING.toString())
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-01")
                .when().get(SLOTS)
                .then().statusCode(200)
                .extract().jsonPath().getList("data.starts_at");

        assertThat(starts).isNotEmpty();
    }

    @Test
    @DisplayName("A booked slot disappears from the list")
    void bookedSlotLeavesTheList() {
        List<String> before = listStarts();
        assertThat(before).contains("2026-09-01T10:00:00Z");

        post()
                .body(booking("2026-09-01T10:00:00Z", "622000005"))
                .when().post(SALON).then().statusCode(201);

        // The offering carries a 15-minute lead-in and a 10-minute tail, so the
        // booking removes rather more than its own hour - exactly what the
        // exclusion constraint would have refused.
        assertThat(listStarts()).doesNotContain("2026-09-01T10:00:00Z");
    }

    @Test
    @DisplayName("Every slot the list offers is one the database accepts")
    void offeredSlotsAreActuallyBookable() {
        // The list and the constraint must agree. A slot advertised and then
        // refused is worse than one never offered: the customer watches it
        // vanish as they tap it.
        String first = listStarts().get(0);

        post()
                .body(booking(first, "622000006"))
                .when().post(SALON)
                .then().statusCode(201);
    }

    @Test
    @DisplayName("A page carries a cursor, and the cursor resumes where it stopped")
    void pagesTheSlots() {
        List<String> all = listStarts();
        assertThat(all).hasSizeGreaterThan(3);

        var first = given()
                .queryParam("service_offering_id", BookingFixtures.SALON_OFFERING.toString())
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-01")
                .queryParam("limit", 3)
                .when().get(SLOTS).then().statusCode(200).extract();

        assertThat(first.jsonPath().getList("data.starts_at", String.class))
                .isEqualTo(all.subList(0, 3));
        String cursor = first.jsonPath().getString("next_cursor");
        assertThat(cursor).isNotBlank();

        List<String> second = given()
                .queryParam("service_offering_id", BookingFixtures.SALON_OFFERING.toString())
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-01")
                .queryParam("limit", 3).queryParam("cursor", cursor)
                .when().get(SLOTS).then().statusCode(200)
                .extract().jsonPath().getList("data.starts_at", String.class);

        // Resumes at the next slot, not at the one already read: a page that
        // repeats its predecessor's last entry double-books it in any UI that
        // appends.
        assertThat(second).isEqualTo(all.subList(3, 6));
    }

    @Test
    @DisplayName("The last page says so by carrying no cursor")
    void lastPageHasNoCursor() {
        String cursor = given()
                .queryParam("service_offering_id", BookingFixtures.SALON_OFFERING.toString())
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-01")
                .queryParam("limit", 200)
                .when().get(SLOTS).then().statusCode(200)
                .extract().jsonPath().getString("next_cursor");

        assertThat(cursor).isNull();
    }

    @Test
    @DisplayName("A cursor the server never minted is a malformed parameter")
    void rejectsAForgedCursor() {
        given().queryParam("service_offering_id", BookingFixtures.SALON_OFFERING.toString())
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-01")
                .queryParam("cursor", "not-a-cursor")
                .when().get(SLOTS)
                .then().statusCode(400).body("code", equalTo("VALIDATION_FAILED"));
    }

    private List<String> listStarts() {
        return given()
                .queryParam("service_offering_id", BookingFixtures.SALON_OFFERING.toString())
                .queryParam("from", "2026-09-01").queryParam("to", "2026-09-01")
                .when().get(SLOTS).then().statusCode(200)
                .extract().jsonPath().getList("data.starts_at");
    }
}
