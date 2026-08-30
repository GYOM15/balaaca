package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.app.it.BookingFixtures.NotificationRow;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The outbox property, through HTTP against a real PostgreSQL: the rows a
 * booking owes commit with it, and only with it.
 *
 * <p>What a unit test cannot show is the half that matters here - that a
 * refused booking leaves nothing behind. Planning correctness is
 * {@code BookingNotificationsTest}; atomicity is this.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class NotificationOutboxIT {

    private static final String SALON = "/v1/providers/salon-fatou/appointments";
    private static final String SOLO = "/v1/providers/coiffeur-solo/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String booking(UUID offering, String startsAt, String phone) {
        return """
               {"service_offering_id":"%s","starts_at":"%s",
                "customer":{"full_name":"Mariama B.","phone":"%s"}}
               """.formatted(offering, startsAt, phone);
    }

    @Test
    @DisplayName("A booking leaves the rows it owes, PENDING and self-contained")
    void bookingWritesTheOutbox() {
        given().contentType("application/json").header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(booking(BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000001"))
                .when().post(SALON).then().statusCode(201);

        List<NotificationRow> rows = fixtures.notifications(BookingFixtures.SALON);

        assertThat(rows).extracting(NotificationRow::kind)
                .containsExactly("BOOKING_CONFIRMATION", "BOOKING_NOTICE", "REMINDER", "REMINDER");
        assertThat(rows).allSatisfy(r -> assertThat(r.status()).isEqualTo("PENDING"));

        // The worker's role can read this table and nothing else, so whatever is
        // not on the row is unreachable when the message is finally sent.
        assertThat(rows.get(0).payload())
                .contains("\"business_name\": \"Salon Fatou\"")
                .contains("\"service_name\": \"Tresses\"");
        assertThat(rows).filteredOn(r -> r.recipientKind().equals("PROVIDER"))
                .singleElement()
                .satisfies(r -> assertThat(r.toPhone()).isEqualTo("+224622999001"));
    }

    @Test
    @DisplayName("A refused booking leaves nothing: the rows are in its transaction")
    void refusedBookingWritesNothing() {
        // 03:00 is outside the declared hours, so the attempt rolls back after
        // the offering has been read and before anything is inserted.
        given().contentType("application/json").header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(booking(BookingFixtures.SALON_OFFERING, "2026-09-04T03:00:00Z", "622000002"))
                .when().post(SALON).then().statusCode(422);

        assertThat(fixtures.notifications(BookingFixtures.SALON)).isEmpty();
    }

    @Test
    @DisplayName("A slot lost to the constraint leaves nothing either")
    void losingTheSlotWritesNothing() {
        given().contentType("application/json").header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(booking(BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000003"))
                .when().post(SALON).then().statusCode(201);
        long afterWinner = fixtures.notifications(BookingFixtures.SALON).size();

        given().contentType("application/json").header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(booking(BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000004"))
                .when().post(SALON).then().statusCode(409);

        assertThat(fixtures.notifications(BookingFixtures.SALON)).hasSize((int) afterWinner);
    }

    @Test
    @DisplayName("A replay plans nothing a second time")
    void replayWritesNothingMore() {
        String key = "key-" + UUID.randomUUID();
        String payload = booking(BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", "622000005");

        given().contentType("application/json").header("Idempotency-Key", key)
                .body(payload).when().post(SALON).then().statusCode(201);
        given().contentType("application/json").header("Idempotency-Key", key)
                .body(payload).when().post(SALON).then().statusCode(200);

        assertThat(fixtures.notifications(BookingFixtures.SALON)).hasSize(4);
    }

    @Test
    @DisplayName("A provider with no published contact is still bookable")
    void unreachableProviderIsStillBookable() {
        given().contentType("application/json").header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body(booking(BookingFixtures.SOLO_OFFERING, "2026-09-04T10:00:00Z", "622000006"))
                .when().post(SOLO).then().statusCode(201);

        assertThat(fixtures.notifications(BookingFixtures.SOLO))
                .extracting(NotificationRow::kind)
                .containsExactly("BOOKING_CONFIRMATION", "REMINDER", "REMINDER");
    }
}
