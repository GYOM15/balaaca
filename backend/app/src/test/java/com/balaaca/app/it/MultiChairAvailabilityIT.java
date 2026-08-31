package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a salon with more than one chair publishes as available.
 *
 * <p>Every fixture in this suite gives a provider exactly one bookable person,
 * so nothing here has ever exercised a second chair - which is why the whole
 * any-staff path could be wrong without a single test noticing. This suite adds
 * the second chair and asks the questions that only make sense once it exists.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class MultiChairAvailabilityIT {

    private static final UUID SECOND_CHAIR =
            UUID.fromString("a7a7a7a7-0000-0000-0000-000000000001");

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
        // A second braider, working exactly the same hours as the first.
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

    private static List<String> publicSlotsOn(String day) {
        return given().queryParam("service_offering_id", BookingFixtures.SALON_OFFERING)
                .queryParam("from", day).queryParam("to", day)
                .when().get("/v1/providers/salon-fatou/available-slots")
                .then().statusCode(200)
                .extract().jsonPath().getList("data.starts_at", String.class);
    }

    private static void book(String startsAt, String staffId, String phone) {
        String staff = staffId == null ? "" : "\"staff_id\":\"" + staffId + "\",";
        given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {%s"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Cliente","phone":"%s"}}
                      """.formatted(staff, BookingFixtures.SALON_OFFERING, startsAt, phone))
                .when().post("/v1/providers/salon-fatou/appointments")
                .then().statusCode(201);
    }

    @Test
    @DisplayName("A slot appears once, however many people could take it")
    void doesNotOfferTheSameSlotOncePerChair() {
        List<String> slots = publicSlotsOn("2026-09-04");

        // Two people on identical hours. If the calculator unions their rules
        // and never merges the windows, every slot is emitted twice - and the
        // customer pages through a list that is half duplicates.
        assertThat(slots).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("One chair taken does not close the salon")
    void keepsOfferingASlotWhileAnotherChairIsFree() {
        List<String> before = publicSlotsOn("2026-09-04");
        assertThat(before).contains("2026-09-04T10:00:00Z");

        // Fatou is booked at ten. Mariama is not.
        book("2026-09-04T10:00:00Z", BookingFixtures.SALON_OWNER_STAFF.toString(), "622000001");

        assertThat(publicSlotsOn("2026-09-04"))
                .as("one braider busy at ten does not make the salon unbookable at ten - "
                    + "the other chair is empty, and a customer sent away from it is a "
                    + "customer the salon lost while it had capacity")
                .contains("2026-09-04T10:00:00Z");
    }

    @Test
    @DisplayName("The list and the booking path agree about what is bookable")
    void offersOnlyWhatItWillAccept() {
        book("2026-09-04T10:00:00Z", BookingFixtures.SALON_OWNER_STAFF.toString(), "622000001");

        // The second chair is free, so the server will accept a booking at ten.
        // A list that hides it is a list that disagrees with its own booking
        // path, and the customer never finds out the slot was there.
        book("2026-09-04T10:00:00Z", null, "622000002");

        assertThat(fixtures.distinctStaffBooked(BookingFixtures.SALON)).isEqualTo(2);
    }

    @Test
    @DisplayName("One person's day off does not close the whole salon")
    void keepsTheSalonOpenWhenOnePersonIsAway() {
        fixtures.execute("""
                INSERT INTO availability_overrides
                       (id, provider_id, staff_id, override_date, kind, reason)
                     VALUES (gen_random_uuid(),'%s','%s','2026-09-04','CLOSED','conge')
                """.formatted(BookingFixtures.SALON, SECOND_CHAIR));

        assertThat(publicSlotsOn("2026-09-04"))
                .as("Mariama is off; Fatou is not. A salon that closes because one "
                    + "person took a day is a salon that loses a Friday")
                .isNotEmpty();
    }
}
