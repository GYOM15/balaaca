package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.balaaca.app.it.BookingFixtures.NotificationRow;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import io.restassured.response.ValidatableResponse;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The rest of an appointment's life, driven through HTTP.
 *
 * <p>The transition table itself is asserted exhaustively without a database in
 * {@code AppointmentStatusTest}. What only a database can show is here: that
 * each move is one statement whose WHERE clause decides, that a move frees or
 * takes a slot under the exclusion constraint, and that another provider's
 * appointment answers exactly like one that never existed.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class AppointmentLifecycleIT {

    private static final String SALON = "/v1/providers/salon-fatou/appointments";
    private static final String SLOT = "2026-09-04T10:00:00Z";
    private static final String LATER = "2026-09-04T14:00:00Z";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String book(String startsAt, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Mariama B.","phone":"%s"}}
                      """.formatted(BookingFixtures.SALON_OFFERING, startsAt, phone))
                .when().post(SALON).then().statusCode(201).extract().path("appointment_id");
    }

    private static ValidatableResponse post(String id, String capability) {
        return given().contentType("application/json").body("{}")
                .when().post("/v1/appointments/" + id + "/" + capability).then();
    }

    private static ValidatableResponse reschedule(String id, String startsAt) {
        return given().contentType("application/json")
                .body("{\"starts_at\":\"%s\"}".formatted(startsAt))
                .when().post("/v1/appointments/" + id + "/reschedule").then();
    }

    @Test
    @DisplayName("An appointment walks its whole legal life")
    void walksTheHappyPath() {
        String id = book(SLOT, "622000001");

        post(id, "confirmation").statusCode(200).body("status", equalTo("CONFIRMED"));
        post(id, "completion").statusCode(200).body("status", equalTo("COMPLETED"));
    }

    @Test
    @DisplayName("A confirmed appointment can be a no-show instead")
    void recordsANoShow() {
        String id = book(SLOT, "622000002");
        post(id, "confirmation").statusCode(200);

        // Kept apart from cancellation deliberately: a customer who cancelled
        // and one who simply did not come are different facts about the same
        // empty chair.
        post(id, "no-show").statusCode(200).body("status", equalTo("NO_SHOW"));
    }

    @Test
    @DisplayName("A pending appointment cannot be completed, nor a completed one confirmed")
    void refusesIllegalMoves() {
        String id = book(SLOT, "622000003");

        post(id, "completion").statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));

        post(id, "confirmation").statusCode(200);
        post(id, "completion").statusCode(200);
        post(id, "confirmation").statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));
        post(id, "no-show").statusCode(409);
    }

    @Test
    @DisplayName("Rescheduling frees the old slot and takes the new one")
    void reschedules() {
        String id = book(SLOT, "622000004");

        reschedule(id, LATER).statusCode(200)
                .body("starts_at", equalTo(LATER))
                .body("appointment_id", equalTo(id));

        // The old time is free again and the new one is not, both as a
        // consequence of the same UPDATE: the exclusion constraint reads the
        // row's current window and nothing else.
        book(SLOT, "622000005");
        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(2);
    }

    @Test
    @DisplayName("A reschedule onto a taken slot is refused by the constraint")
    void refusesAMoveOntoATakenSlot() {
        String moving = book(SLOT, "622000006");
        book(LATER, "622000007");

        reschedule(moving, LATER).statusCode(409).body("code", equalTo("SLOT_UNAVAILABLE"));

        // Nothing moved: the statement that would have moved it is the one the
        // constraint refused.
        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data.find { it.appointment_id == '%s' }.starts_at".formatted(moving),
                      equalTo(SLOT));
    }

    @Test
    @DisplayName("A reschedule outside the declared hours is refused before the constraint")
    void refusesAMoveOutsideAvailability() {
        String id = book(SLOT, "622000008");

        reschedule(id, "2026-09-04T03:00:00Z")
                .statusCode(422).body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));
    }

    @Test
    @DisplayName("A reschedule replans what the old time owed")
    void replansTheReminders() {
        String id = book(SLOT, "622000009");

        reschedule(id, LATER).statusCode(200);

        // Everything planned for the old time is withdrawn, and a notice of the
        // move is owed. A reminder still PENDING would arrive for an hour the
        // customer was told had changed.
        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .filteredOn(r -> !r.kind().equals("RESCHEDULE"))
                .allSatisfy(r -> assertThat(r.status()).isEqualTo("CANCELLED"));
        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .filteredOn(r -> r.kind().equals("RESCHEDULE"))
                .singleElement()
                .satisfies(r -> assertThat(r.status()).isEqualTo("PENDING"));
    }

    @Test
    @DisplayName("A cancelled appointment moves no further")
    void terminalStatesAreTerminal() {
        String id = book(SLOT, "622000010");
        given().contentType("application/json").body("{}")
                .when().post("/v1/appointments/" + id + "/cancellation").then().statusCode(200);

        reschedule(id, LATER).statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));
        post(id, "confirmation").statusCode(409);
    }

    @Test
    @DisplayName("An appointment that is not the caller's answers like one that never existed")
    void cannotMoveSomeoneElses() {
        String unknown = UUID.randomUUID().toString();

        post(unknown, "confirmation").statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
        reschedule(unknown, LATER).statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }
}
