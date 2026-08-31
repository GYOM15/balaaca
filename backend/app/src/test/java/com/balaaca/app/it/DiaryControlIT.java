package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;

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
 * A provider seeing and controlling its own diary.
 *
 * <p>Two things it could not do. The agenda returned an undifferentiated stream
 * - {@code staff_id} is NOT NULL on every appointment, is the resource key of
 * the constraint that stops double booking, and was neither returned nor
 * filterable - so a salon with several chairs could not label a row, and "show
 * me Saturday" paged into next month for want of an upper bound.
 *
 * <p>And the five columns that decide when a business can be booked at all were
 * enforced everywhere and writable by nothing: every provider on the platform
 * was frozen on the defaults.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class DiaryControlIT {

    private static final UUID SECOND_CHAIR =
            UUID.fromString("a8a8a8a8-0000-0000-0000-000000000001");

    private static final String[] EVERYTHING = {
            "dashboard:read", "profile:write", "appointments:write"};

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

    private static void book(String startsAt, UUID staffId, String phone) {
        given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Cliente","phone":"%s"}}
                      """.formatted(staffId, BookingFixtures.SALON_OFFERING, startsAt, phone))
                .when().post("/v1/providers/salon-fatou/appointments").then().statusCode(201);
    }

    @Test
    @DisplayName("The agenda says whose appointment each one is")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void namesTheChair() {
        book("2026-09-04T10:00:00Z", BookingFixtures.SALON_OWNER_STAFF, "622000001");

        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data[0].staff_id", equalTo(BookingFixtures.SALON_OWNER_STAFF.toString()))
                .body("data[0].staff_name", equalTo("Fatou"));
    }

    @Test
    @DisplayName("One person's day can be read on its own")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void filtersByChair() {
        book("2026-09-04T10:00:00Z", BookingFixtures.SALON_OWNER_STAFF, "622000001");
        book("2026-09-04T10:00:00Z", SECOND_CHAIR, "622000002");

        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().body("data", hasSize(2));

        given().queryParam("from", "2026-09-01T00:00:00Z")
                .queryParam("staff_id", SECOND_CHAIR)
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].staff_name", equalTo("Mariama"));
    }

    @Test
    @DisplayName("Show me one day means one day, not everything after it")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void boundsTheDay() {
        book("2026-09-04T10:00:00Z", BookingFixtures.SALON_OWNER_STAFF, "622000001");
        book("2026-09-11T10:00:00Z", BookingFixtures.SALON_OWNER_STAFF, "622000002");

        // Without an upper bound the agenda is a ray, and a day view reads
        // pages it throws away.
        given().queryParam("from", "2026-09-04T00:00:00Z")
                .queryParam("to", "2026-09-04T23:59:59Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data", hasSize(1));
    }

    @Test
    @DisplayName("A provider sets the rules its own diary runs by")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void changesItsOwnPolicy() {
        given().when().get("/v1/booking-policy").then().statusCode(200)
                .body("slot_granularity_minutes", equalTo(15))
                .body("min_lead_time_minutes", equalTo(60))
                .body("auto_confirm", is(false));

        // A caterer needing two days' notice had no request that said so.
        given().contentType("application/json")
                .body("""
                      {"slot_granularity_minutes":30,"min_lead_time_minutes":2880,
                       "max_advance_days":90,"cancellation_deadline_minutes":1440,
                       "auto_confirm":true}
                      """)
                .when().put("/v1/booking-policy").then().statusCode(200)
                .body("min_lead_time_minutes", equalTo(2880))
                .body("auto_confirm", is(true));

        given().when().get("/v1/booking-policy").then()
                .body("cancellation_deadline_minutes", equalTo(1440));
    }

    @Test
    @DisplayName("The new policy decides the next booking, not the ones already taken")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void appliesThePolicyToTheNextBooking() {
        given().contentType("application/json")
                .body("""
                      {"slot_granularity_minutes":15,"min_lead_time_minutes":60,
                       "max_advance_days":90,"cancellation_deadline_minutes":120,
                       "auto_confirm":true}
                      """)
                .when().put("/v1/booking-policy").then().statusCode(200);

        // auto_confirm was false for this salon; the next booking arrives
        // CONFIRMED because the INSERT reads the row, not a cached value.
        given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-04T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000009"}}
                      """.formatted(BookingFixtures.SALON_OFFERING))
                .when().post("/v1/providers/salon-fatou/appointments")
                .then().statusCode(201).body("status", equalTo("CONFIRMED"));
    }

    @Test
    @DisplayName("The bounds the schema enforces are the bounds the contract states")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesAValueTheRowWouldRefuse() {
        // A value that got past the schema and failed on the CHECK would
        // surface as a 500, so the two agree rather than one trusting the other.
        given().contentType("application/json")
                .body("""
                      {"slot_granularity_minutes":1,"min_lead_time_minutes":60,
                       "max_advance_days":90,"cancellation_deadline_minutes":120,
                       "auto_confirm":true}
                      """)
                .when().put("/v1/booking-policy").then().statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("An employee cannot change when the business can be booked")
    @TestSecurity(user = BookingFixtures.EMPLOYEE_SUBJECT,
                  roles = {"dashboard:read", "profile:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.EMPLOYEE_SUBJECT))
    void refusesANonOwner() {
        fixtures.seedEmployee();

        given().contentType("application/json")
                .body("""
                      {"slot_granularity_minutes":30,"min_lead_time_minutes":0,
                       "max_advance_days":90,"cancellation_deadline_minutes":0,
                       "auto_confirm":true}
                      """)
                .when().put("/v1/booking-policy").then().statusCode(403);
    }
}
