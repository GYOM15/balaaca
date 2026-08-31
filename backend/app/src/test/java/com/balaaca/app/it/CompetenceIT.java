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
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Who in the team actually does this.
 *
 * <p>Until now nobody could say. {@code eligibleStaff(serviceOfferingId)} took a
 * service and ignored it, so a customer booking braids was handed to whoever was
 * least busy - as likely to be the person who does nails. For a solo barber that
 * was correct; for the salon with a braider and a nail technician, which is most
 * of them and the reason provider_staff exists, it was not.
 *
 * <p>The semantics are strict: a row means the person performs it, and its
 * absence means they do not. What keeps that invisible to a provider who never
 * opens the screen is the pair of grants - a new service to the whole team, a
 * new colleague to the whole catalogue - and those are what the first two tests
 * are about.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "catalog:write", "staff:write", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class CompetenceIT {

    private static final String BOOK = "/v1/providers/salon-fatou/appointments";
    private static final String TRESSES = BookingFixtures.SALON_OFFERING.toString();
    private static final String OWNER = BookingFixtures.SALON_OWNER_STAFF.toString();
    private static final UUID SECOND_CHAIR =
            UUID.fromString("a2a2a2a2-0000-0000-0000-000000000009");

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String performers(String offering) {
        return "/v1/service-offerings/" + offering + "/performers";
    }

    private static void restrictTo(String offering, String... staffIds) {
        String ids = String.join(",", java.util.Arrays.stream(staffIds)
                .map(id -> "\"" + id + "\"").toList());
        given().contentType("application/json")
                .body("{\"staff_ids\":[" + ids + "]}")
                .when().put(performers(offering)).then().statusCode(200);
    }

    /** A second chair, with the same hours, so the two are interchangeable. */
    private void secondChair() {
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

    @Test
    @DisplayName("A new service is performed by the whole team from the start")
    void aNewServiceIsGrantedToEverybody() {
        secondChair();

        String offering = given().contentType("application/json")
                .body("""
                      {"name":"Manucure","duration_minutes":45,
                       "price":{"amount_minor":80000,"currency":"GNF"}}
                      """)
                .when().post("/v1/service-offerings").then().statusCode(201)
                .extract().path("service_offering_id");

        // Without this grant a service would be unbookable from the moment it
        // was published, and the provider would have no idea why.
        given().when().get(performers(offering)).then().statusCode(200)
                .body("data", hasSize(2))
                .body("data.staff_id", hasItem(OWNER));
    }

    @Test
    @DisplayName("A new colleague performs the whole catalogue from the start")
    void aNewColleagueIsGrantedEverything() {
        String hired = given().contentType("application/json")
                .body("""
                      {"display_name":"Aissatou","bookable":true,"active":true}
                      """)
                .when().post("/v1/staff").then().statusCode(201)
                .extract().path("staff_id");

        given().when().get(performers(TRESSES)).then().statusCode(200)
                .body("data.staff_id", hasItem(hired));
    }

    @Test
    @DisplayName("The server picks somebody who performs the service")
    void theServerChoosesAPerformer() {
        secondChair();
        // Only the second chair braids. The owner has an empty diary and is
        // therefore the least loaded, so before the join she was always the
        // one chosen - for work she does not do.
        restrictTo(TRESSES, SECOND_CHAIR.toString());

        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(TRESSES))
                .when().post(BOOK).then().statusCode(201);

        given().queryParam("from", "2026-09-07T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data[0].staff_id", equalTo(SECOND_CHAIR.toString()));
    }

    @Test
    @DisplayName("Naming somebody who does not perform it is answered, not reassigned")
    void aNamedNonPerformerIsRefused() {
        secondChair();
        restrictTo(TRESSES, SECOND_CHAIR.toString());

        // 422 and not 404: the owner exists and is on the public page, so a 404
        // would be a lie the client could disprove. And answered rather than
        // silently reassigned - somebody who asked for Fatou and got Mariama
        // would find out in the chair.
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s",
                       "starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(OWNER, TRESSES))
                .when().post(BOOK).then().statusCode(422)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("The public slot list and the booking path agree on who can take it")
    void theSlotListDoesNotAdvertiseWhatBookingRefuses() {
        secondChair();
        // The second chair braids; the owner does not, and only the owner is
        // free at nine. If the slot list ignored competence it would advertise
        // a nine o'clock that the booking path then refuses - the union-across-
        // chairs defect, produced again one table further out.
        fixtures.execute("""
                DELETE FROM availability_rules
                 WHERE staff_id = '%s' AND day_of_week = 1;
                INSERT INTO availability_rules
                       (id, provider_id, staff_id, day_of_week, start_time, end_time)
                     VALUES (gen_random_uuid(),'%s','%s',1,'14:00','20:00')
                """.formatted(SECOND_CHAIR, BookingFixtures.SALON, SECOND_CHAIR));
        restrictTo(TRESSES, SECOND_CHAIR.toString());

        // Monday 7 September 2026. The braider works only the afternoon.
        var starts = given()
                .queryParam("service_offering_id", TRESSES)
                .queryParam("from", "2026-09-07").queryParam("to", "2026-09-07")
                .when().get("/v1/providers/salon-fatou/available-slots")
                .then().statusCode(200)
                .extract().jsonPath().getList("data.starts_at", String.class);

        // 08:00 local is 08:00 UTC in Conakry, and it belongs to the owner.
        assertNoSlotBefore(starts, "2026-09-07T14:00:00Z");
    }

    @Test
    @DisplayName("A service nobody performs can no longer be booked")
    void anEmptySetIsMeaningful() {
        // A real thing a provider does when a specialist leaves. Refusing it
        // would force them to retire the service instead.
        given().contentType("application/json").body("{\"staff_ids\":[]}")
                .when().put(performers(TRESSES)).then().statusCode(200)
                .body("data", hasSize(0));

        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(TRESSES))
                // 409 and not a code of its own, for the reason the exception
                // already gives: from the customer's side "nobody here can take
                // it" and "that slot is gone" are the same outcome, and telling
                // them apart would publish how many people work there.
                .when().post(BOOK).then().statusCode(409);
    }

    @Test
    @DisplayName("Strictness does not turn an unknown service into a busy one")
    void aForeignOfferingIsStill404() {
        // The regression this whole join nearly caused. A service that is not
        // this provider's joins to nobody, so the candidate list came back
        // empty and the customer was told "that slot is gone" for a service
        // that does not exist here. The offering is resolved first, and 404 is
        // what the contract promises.
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(BookingFixtures.HIDDEN_OFFERING))
                .when().post(BOOK).then().statusCode(404)
                .body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("A stranger's staff id is refused, not skipped")
    void aForeignPerformerIsRefused() {
        // Silently dropping it would report success and leave the service
        // performed by fewer people than the provider just said.
        given().contentType("application/json")
                .body("{\"staff_ids\":[\"b1b1b1b1-0000-0000-0000-000000000001\"]}")
                .when().put(performers(TRESSES)).then().statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));

        // And nothing was written: the refusal leaves the service performed by
        // exactly who performed it before.
        given().when().get(performers(TRESSES)).then().statusCode(200)
                .body("data.staff_id", hasItem(OWNER));
    }

    @Test
    @DisplayName("Another provider's service is not found, not forbidden")
    void aForeignServiceIs404() {
        given().when().get(performers(BookingFixtures.HIDDEN_OFFERING.toString()))
                .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("The same person sent twice is counted once")
    void duplicatesCollapse() {
        // The primary key would otherwise refuse the whole request over a
        // duplicate that changes nothing.
        restrictTo(TRESSES, OWNER, OWNER);

        given().when().get(performers(TRESSES)).then().statusCode(200)
                .body("data", hasSize(1));
    }

    private static void assertNoSlotBefore(java.util.List<String> starts, String bound) {
        org.junit.jupiter.api.Assertions.assertFalse(starts.isEmpty(),
                "the braider works the afternoon, so there are slots");
        starts.forEach(at -> org.junit.jupiter.api.Assertions.assertTrue(
                at.compareTo(bound) >= 0,
                "the list offered " + at + ", which nobody who braids can take"));
    }

    @Test
    @DisplayName("Competence is not bookability")
    void aNonBookablePersonKeepsTheirCompetence() {
        secondChair();
        fixtures.execute("UPDATE provider_staff SET bookable = false WHERE id = '%s'"
                .formatted(SECOND_CHAIR));

        // A receptionist who stops taking bookings has not forgotten how to
        // braid: the row stays, and the booking path filters on bookable
        // separately.
        given().when().get(performers(TRESSES)).then().statusCode(200)
                .body("data.find { it.staff_id == '%s' }.bookable".formatted(SECOND_CHAIR),
                      equalTo(false));

        given().when().get("/v1/providers/salon-fatou/staff").then().statusCode(200)
                .body("data.staff_id", not(hasItem(SECOND_CHAIR.toString())));
    }
}
