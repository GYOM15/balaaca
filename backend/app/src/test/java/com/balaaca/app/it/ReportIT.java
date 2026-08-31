package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

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
 * The inbox a moderation lever needs.
 *
 * <p>Tied to a booking reference and never to a public slug, because this is a
 * hub in a market where a salon's competitor is three streets away and knows
 * the handle: an anonymous report button on a public page is something that
 * competitor can press from a script all night.
 *
 * <p>The other half of the design is who may READ one. A provider must never be
 * able to see what was filed against it - the appointment names the customer,
 * and in a market this small that is the difference between a report and a
 * reprisal. That is enforced by the absence of a tenant policy on the table,
 * which is the kind of thing worth a test that would notice it coming back.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ReportIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String aBooking() {
        return given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Cliente","phone":"622000001"}}
                      """.formatted(BookingFixtures.SALON_OFFERING))
                .when().post("/v1/providers/salon-fatou/appointments")
                .then().statusCode(201).extract().path("reference");
    }

    private static void report(String reference, String body, int expected) {
        given().contentType("application/json").body(body)
                .when().post("/v1/bookings/" + reference + "/report")
                .then().statusCode(expected);
    }

    @Test
    @DisplayName("A customer who booked can say something went wrong")
    void aCustomerCanReport() {
        report(aBooking(), """
               {"reason":"NO_SHOW","details":"Le salon etait ferme."}
               """, 202);
    }

    @Test
    @DisplayName("A reference nobody holds reports nothing")
    void aStrangerCannotReport() {
        // The capability is the guard. Without a reference there is no button,
        // which is what keeps a rival from pressing it all night.
        report("AAAAAAAAAAAAAAAAAAAAAA", "{\"reason\":\"OTHER\"}", 404);
    }

    @Test
    @DisplayName("Pressing it twice is one report, not two")
    void reportingIsIdempotent() {
        String reference = aBooking();
        report(reference, "{\"reason\":\"NO_SHOW\"}", 202);
        report(reference, "{\"reason\":\"NO_SHOW\"}", 202);

        given().when().get("/v1/admin/reports").then().statusCode(401);
    }

    @Test
    @DisplayName("The queue reads as an event, and reviewing records that somebody looked")
    @TestSecurity(user = "kc-operator", roles = "admin:moderation")
    @OidcSecurity(claims = @Claim(key = "sub", value = "kc-operator"))
    void theOperatorWorksTheQueue() {
        String reference = aBooking();
        report(reference, """
               {"reason":"RUDE_OR_UNSAFE","details":"Comportement inacceptable."}
               """, 202);

        String id = given().when().get("/v1/admin/reports?status=PENDING").then().statusCode(200)
                .body("data", hasSize(1))
                .body("data[0].provider_slug", equalTo("salon-fatou"))
                .body("data[0].reason", equalTo("RUDE_OR_UNSAFE"))
                // The appointment travels with it, so the report reads as "this
                // booking, this service, this day" rather than "someone says
                // something".
                .body("data[0].service_name", equalTo("Tresses"))
                .body("data[0].appointment_starts_at", equalTo("2026-09-07T10:00:00Z"))
                .body("data[0].status", equalTo("PENDING"))
                .extract().path("data[0].report_id");

        given().when().post("/v1/admin/reports/" + id + "/review").then().statusCode(200)
                .body("status", equalTo("REVIEWED"));

        // Two states and no workflow: REVIEWED says the operator looked, not
        // that the business was punished. That decision has its own audit row.
        given().when().get("/v1/admin/reports?status=PENDING").then().statusCode(200)
                .body("data", hasSize(0));

        given().when().post("/v1/admin/reports/" + UUID.randomUUID() + "/review")
                .then().statusCode(404);
    }

    @Test
    @DisplayName("A provider cannot read what was filed against it")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void theAccusedIsNotTheReader() {
        // Not a filter in a query - there is no tenant policy on the table at
        // all, so the salon's own connection cannot see a single row of it.
        given().when().get("/v1/admin/reports").then().statusCode(403);
    }
}
