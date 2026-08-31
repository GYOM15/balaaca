package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

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
 * Three things the published contract said that were not true.
 *
 * <p>An audit that read the contract as a client would found them: a field
 * accepted and discarded, a documented status that no provider produced, and a
 * transition that notified nobody. All three would have surfaced on the first
 * day someone rendered a booking screen, which is the argument for building one.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class BookingTruthIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static io.restassured.path.json.JsonPath book(String slug, UUID offering,
                                                          String startsAt, String note) {
        String noteField = note == null ? "" : "\"customer_note\":\"" + note + "\",";
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {%s"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Mariama B.","phone":"622000001"}}
                      """.formatted(noteField, offering, startsAt))
                .when().post("/v1/providers/" + slug + "/appointments")
                .then().statusCode(201).extract().jsonPath();
    }

    @Test
    @DisplayName("The response says whether the salon is already expecting you")
    void tellsTheCustomerWhichStatusTheyGot() {
        // The contract said "Creates a PENDING appointment" unconditionally,
        // and auto_confirm defaults to true - so it was wrong for almost every
        // provider, and the customer had no way to know which they got.
        assertThat(book("salon-fatou", BookingFixtures.SALON_OFFERING,
                        "2026-09-04T10:00:00Z", null).getString("status"))
                .isEqualTo("PENDING");

        assertThat(book("coiffeur-solo", BookingFixtures.SOLO_OFFERING,
                        "2026-09-04T10:00:00Z", null).getString("status"))
                .isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("A message for the salon reaches the salon")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void carriesTheCustomerNoteToTheAgenda() {
        // customer_note was published with maxLength 500 and dropped at the
        // edge: the box said "Message for the salon" and the message went
        // nowhere.
        book("salon-fatou", BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z",
             "Je viendrai avec ma fille");

        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data[0].customer_note", equalTo("Je viendrai avec ma fille"));
    }

    @Test
    @DisplayName("No note is no field, not an empty one")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void omitsTheNoteWhenThereIsNone() {
        book("salon-fatou", BookingFixtures.SALON_OFFERING, "2026-09-04T10:00:00Z", null);

        given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .body("data[0].customer_note", nullValue());
    }

    @Test
    @DisplayName("Accepting a booking sends the customer the message they waited for")
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT,
                  roles = {"dashboard:read", "appointments:write"})
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    void notifiesTheCustomerOnAcceptance() {
        String id = book("salon-fatou", BookingFixtures.SALON_OFFERING,
                         "2026-09-04T10:00:00Z", null).getString("appointment_id");

        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .extracting(BookingFixtures.NotificationRow::kind)
                .doesNotContain("BOOKING_ACCEPTED");

        given().when().post("/v1/appointments/" + id + "/confirmation")
                .then().statusCode(200).body("status", equalTo("CONFIRMED"));

        // Confirming used to be a bare conditional UPDATE that planned nothing,
        // so the one message a waiting customer wanted was the one the system
        // never wrote - and WhatsApp credentials would not have fixed it,
        // because there was no row to send.
        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .extracting(BookingFixtures.NotificationRow::kind)
                .contains("BOOKING_ACCEPTED");
    }

    @Test
    @DisplayName("A provider that confirms on arrival has nothing to accept")
    void plansNoAcceptanceWhenThereIsNothingToAccept() {
        book("coiffeur-solo", BookingFixtures.SOLO_OFFERING, "2026-09-04T10:00:00Z", null);

        assertThat(fixtures.notifications(BookingFixtures.SOLO))
                .extracting(BookingFixtures.NotificationRow::kind)
                .doesNotContain("BOOKING_ACCEPTED");
    }
}
