package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
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
 * The address book that was being written and never read.
 *
 * <p>`customers` has filled up on every booking since the table existed and no
 * endpoint touched it: a salon could not see who its customers were, could not
 * find the person who telephoned yesterday, and could not tell a regular from a
 * first visit. The rows were there the whole time - this is the read.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
@TestSecurity(user = BookingFixtures.SALON_SUBJECT,
              roles = {"dashboard:read", "appointments:write"})
@OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
class ClienteleIT {

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static void book(String name, String phone, String at) {
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"%s","phone":"%s"}}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF,
                                    BookingFixtures.SALON_OFFERING, at, name, phone))
                .when().post("/v1/providers/salon-fatou/appointments")
                .then().statusCode(201);
    }

    @Test
    @DisplayName("Everybody who has booked is in the book, with their history")
    void theBookIsReadable() {
        book("Mariama Barry", "622000001", "2026-09-07T10:00:00Z");
        book("Mariama Barry", "622000001", "2026-09-08T10:00:00Z");
        book("Aissatou Diallo", "622000002", "2026-09-07T14:00:00Z");

        // Alphabetical, because that is how somebody reads an address book.
        String id = given().when().get("/v1/customers").then().statusCode(200)
                .body("data", hasSize(2))
                .body("data[0].full_name", equalTo("Aissatou Diallo"))
                .body("data[1].full_name", equalTo("Mariama Barry"))
                // The same person booking twice is one customer, upserted on
                // the provider's own (provider_id, phone) key.
                .body("data[1].visits", equalTo(2))
                .body("data[1].phone", equalTo("+224622000001"))
                .extract().path("data[1].customer_id");

        given().when().get("/v1/customers/" + id).then().statusCode(200)
                .body("history", hasSize(2))
                // Most recent first: a salon opening a card wants the last
                // visit, not the first.
                .body("history[0].starts_at", equalTo("2026-09-08T10:00:00Z"))
                .body("history[0].service_name", equalTo("Tresses"))
                .body("history[0].staff_name", equalTo("Fatou"))
                // Frozen on the row, beside the name. A salon opening this card
                // is asking what somebody is worth to the business, and a
                // history of dates with no amounts cannot answer it - nor can
                // the catalogue, which holds today's price for a service that
                // may have been repriced, renamed or retired since.
                .body("history[0].price.amount_minor", equalTo(150000))
                .body("history[0].price.currency", equalTo("GNF"));
    }

    @Test
    @DisplayName("A salon looks somebody up by name or by number")
    void theSearchMatchesEither() {
        book("Mariama Barry", "622000001", "2026-09-07T10:00:00Z");
        book("Aissatou Diallo", "622000002", "2026-09-07T14:00:00Z");

        given().when().get("/v1/customers?q=mari").then().statusCode(200)
                .body("data", hasSize(1)).body("data[0].full_name", equalTo("Mariama Barry"));

        // The number as they know it, not as it is stored: a salon types the
        // last digits off a missed call.
        given().when().get("/v1/customers?q=000002").then().statusCode(200)
                .body("data", hasSize(1)).body("data[0].full_name", equalTo("Aissatou Diallo"));

        // One character matches most of the book and answers nothing, so it is
        // ignored rather than obeyed.
        given().when().get("/v1/customers?q=a").then().statusCode(200)
                .body("data", hasSize(2));
    }

    @Test
    @DisplayName("A cancelled appointment still counts as a visit")
    void cancellationsAreNotHidden() {
        book("Mariama Barry", "622000001", "2026-09-07T10:00:00Z");

        String appointmentId = given().queryParam("from", "2026-09-01T00:00:00Z")
                .when().get("/v1/appointments").then().statusCode(200)
                .extract().path("data[0].appointment_id");
        given().contentType("application/json").body("{\"reason\":\"empechement\"}")
                .when().post("/v1/appointments/" + appointmentId + "/cancellation")
                .then().statusCode(200);

        // A count that hid cancellations would make a serial canceller look
        // like a new customer, which is exactly the person a salon wants to
        // recognise.
        given().when().get("/v1/customers").then().statusCode(200)
                .body("data[0].visits", equalTo(1));
    }

    @Test
    @DisplayName("The provider's own note is kept, and cleared when emptied")
    void theNoteBelongsToTheProvider() {
        book("Mariama Barry", "622000001", "2026-09-07T10:00:00Z");
        String id = given().when().get("/v1/customers").then().statusCode(200)
                .extract().path("data[0].customer_id");

        given().when().get("/v1/customers").then().statusCode(200)
                .body("data[0].has_notes", equalTo(false));

        given().contentType("application/json")
                .body("{\"notes\":\"  Allergique a l'ammoniaque.  \"}")
                .when().put("/v1/customers/" + id + "/notes").then().statusCode(200)
                .body("notes", equalTo("Allergique a l'ammoniaque."))
                .body("has_notes", equalTo(true));

        // Two code paths, one question. The list reads a boolean out of SQL,
        // the card derives it from the note it is already carrying, and a list
        // that said "Note" beside a card opening on an empty box would be
        // nobody's fault and would stay.
        given().when().get("/v1/customers").then().statusCode(200)
                .body("data[0].has_notes", equalTo(true));

        // Nothing but spaces is no note - it would render as a card that looks
        // annotated and says nothing.
        given().contentType("application/json").body("{\"notes\":\"   \"}")
                .when().put("/v1/customers/" + id + "/notes").then().statusCode(200)
                .body("notes", nullValue())
                .body("has_notes", equalTo(false));

        given().when().get("/v1/customers").then().statusCode(200)
                .body("data[0].has_notes", equalTo(false));
    }

    @Test
    @DisplayName("Another salon's customer does not exist")
    void theBookIsOnesOwn() {
        // coiffeur-solo's customer, created through its own public page.
        given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-07T10:00:00Z",
                       "customer":{"full_name":"Ailleurs","phone":"622000009"}}
                      """.formatted(BookingFixtures.SOLO_OFFERING))
                .when().post("/v1/providers/coiffeur-solo/appointments")
                .then().statusCode(201);

        // Not filtered out by a condition somebody could forget: RLS removed
        // the row from the statement's reach before it ran.
        given().when().get("/v1/customers").then().statusCode(200)
                .body("data", hasSize(0));
    }

    @Test
    @DisplayName("The address book is never cached")
    void itIsNeverCached() {
        // A list of named people with their telephone numbers must not sit in
        // any intermediary, and must not come back from a browser's history.
        given().when().get("/v1/customers").then().statusCode(200)
                .header("Cache-Control", equalTo("no-store"));
    }

    @Test
    @TestSecurity(user = BookingFixtures.SALON_SUBJECT, roles = "dashboard:read")
    @OidcSecurity(claims = @Claim(key = "sub", value = BookingFixtures.SALON_SUBJECT))
    @DisplayName("The card separates somebody who comes from somebody who books")
    void countsWhatWasNotHonoured() {
        // `visits` counts every appointment in every state, deliberately - so
        // eight kept and eight booked with two honoured are the same number on
        // the same card. This is the only thing that tells them apart, and it
        // is the figure a provider wants before deciding whether to block
        // anybody.
        book("Mariama Barry", "622000001", "2026-09-07T10:00:00Z");
        book("Mariama Barry", "622000001", "2026-09-08T10:00:00Z");
        book("Aissatou Diallo", "622000002", "2026-09-07T14:00:00Z");

        fixtures.execute("UPDATE appointments SET status = 'NO_SHOW' WHERE id IN "
                + "(SELECT id FROM appointments ORDER BY starts_at LIMIT 1)");

        var card = given().when().get("/v1/customers").then().statusCode(200)
                .extract().jsonPath();

        assertThat(card.getList("data.no_show_count", Integer.class)).isNotEmpty();
        assertThat(card.getInt("data.no_show_count.sum()")).isEqualTo(1);
        // And a cancellation is NOT one of them: somebody who telephoned gave
        // the chair back, and somebody who simply did not come cost the hour.
        // The whole shape, because ck_appointments_cancel_shape refuses a
        // cancellation with no date and no author - the schema defending the
        // same distinction this field exists to make.
        fixtures.execute("UPDATE appointments SET status = 'CANCELLED', "
                + "cancelled_at = now(), cancelled_by = 'PROVIDER' "
                + "WHERE status IN ('PENDING','CONFIRMED')");
        assertThat(given().when().get("/v1/customers").then().statusCode(200)
                .extract().jsonPath().getInt("data.no_show_count.sum()")).isEqualTo(1);
    }
}
