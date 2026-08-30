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
import jakarta.inject.Inject;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Cancelling, and the three things it must get right at once: the slot comes
 * back, the reminder that is no longer owed is withdrawn, and somebody else's
 * appointment is not cancellable at all.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class CancellationIT {

    private static final String SALON_BOOKING = "/v1/providers/salon-fatou/appointments";
    private static final String SOLO_BOOKING = "/v1/providers/coiffeur-solo/appointments";
    private static final String SLOT = "2026-09-04T10:00:00Z";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String book(String path, UUID offering, String startsAt, String phone) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Mariama B.","phone":"%s"}}
                      """.formatted(offering, startsAt, phone))
                .when().post(path).then().statusCode(201)
                .extract().path("appointment_id");
    }

    private static io.restassured.response.ValidatableResponse cancel(String id) {
        return given().contentType("application/json").body("{\"reason\":\"ferie\"}")
                .when().post("/v1/appointments/" + id + "/cancellation").then();
    }

    @Test
    @DisplayName("Cancelling returns the appointment in its new state")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void cancels() {
        String id = book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, SLOT, "622000001");

        cancel(id).statusCode(200)
                .body("status", equalTo("CANCELLED"))
                .body("appointment_id", equalTo(id));

        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isZero();
    }

    @Test
    @DisplayName("The slot comes back, in the same statement that freed it")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void releasesTheSlot() {
        String id = book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, SLOT, "622000001");
        cancel(id).statusCode(200);

        // The exclusion constraint is partial on the active statuses, so the row
        // stops blocking the moment its status changes - there is no second
        // statement and no window in which the slot is neither taken nor free.
        book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, SLOT, "622000002");

        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(1);
    }

    @Test
    @DisplayName("The reminder that is no longer owed is withdrawn, and one notice is planned")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void withdrawsWhatIsNoLongerOwed() {
        String id = book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, SLOT, "622000001");
        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .extracting(NotificationRow::status).containsOnly("PENDING");

        cancel(id).statusCode(200);

        List<NotificationRow> rows = fixtures.notifications(BookingFixtures.SALON);
        // Everything planned for an appointment that is off is retracted - a
        // reminder still PENDING would text a customer hours after they were
        // told it was cancelled - and exactly one message is now owed.
        assertThat(rows).filteredOn(r -> !r.kind().equals("CANCELLATION"))
                .allSatisfy(r -> assertThat(r.status()).isEqualTo("CANCELLED"));
        assertThat(rows).filteredOn(r -> r.kind().equals("CANCELLATION"))
                .singleElement()
                .satisfies(r -> {
                    assertThat(r.status()).isEqualTo("PENDING");
                    assertThat(r.recipientKind()).isEqualTo("CUSTOMER");
                });
    }

    @Test
    @DisplayName("Cancelling twice is refused, not silently repeated")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesASecondCancellation() {
        String id = book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, SLOT, "622000001");
        cancel(id).statusCode(200);

        cancel(id).statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));
    }

    @Test
    @DisplayName("Another provider's appointment answers exactly like one that never existed")
    @TestSecurity(user = BookingFixtures.SOLO_SUBJECT, roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SOLO_SUBJECT))
    void cannotCancelSomeoneElses() {
        String theirs = book(SALON_BOOKING, BookingFixtures.SALON_OFFERING, SLOT, "622000001");

        // Byte for byte the answer an unknown id gets. Any way to tell the two
        // apart is an oracle for whether a hidden appointment exists.
        cancel(theirs).statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
        cancel(UUID.randomUUID().toString())
                .statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));

        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isEqualTo(1);
    }

    @Test
    @DisplayName("Reading the agenda does not grant cancelling it")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = {"dashboard:read"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void refusesWithoutTheWriteScope() {
        // The contract declares appointments:write on this operation. Without a
        // test for the token that lacks it, the declaration is documentation:
        // the scopes would be in the OpenAPI document and in the realm, and
        // nothing would be checking them at the door.
        given().contentType("application/json").body("{}")
                .when().post("/v1/appointments/" + UUID.randomUUID() + "/cancellation")
                .then().statusCode(403);
    }

    @Test
    @DisplayName("An anonymous caller cannot cancel anything")
    void refusesAnAnonymousCaller() {
        // With the content type, as a real client sends it. Without one the
        // answer is 415 and the test proves nothing about authentication:
        // JAX-RS matches the method, media type included, before security runs.
        given().contentType("application/json").body("{}")
                .when().post("/v1/appointments/" + UUID.randomUUID() + "/cancellation")
                .then().statusCode(401);
    }
}
