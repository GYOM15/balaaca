package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

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
 * The customer says how they want to be reached.
 *
 * <p>The assumption this replaces was that WhatsApp is the only channel that
 * matters here. It is not: a pharmacist, an optician or a garage treats e-mail
 * as the professional channel and wants a confirmation that looks like one. The
 * business knows what it prefers; the person standing at the counter knows what
 * they actually read, and may be somebody who opens nothing but WhatsApp. So
 * the question is asked at booking, of the customer.
 *
 * <p>What has to be proved rather than assumed is where the answer RESTS. It is
 * frozen onto the appointment, not remembered against the telephone number,
 * because customers are upserted on (provider_id, phone_e164) and a standing
 * preference would let October's booking silently re-address the messages
 * September's still owes.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class ContactChannelIT {

    private static final String BOOK = "/v1/providers/salon-fatou/appointments";

    /** Monday, inside the salon's declared 08:00 to 20:00. */
    private static final String MORNING = "2026-09-07T10:00:00Z";
    private static final String AFTERNOON = "2026-09-07T14:00:00Z";

    private static final String PHONE = "622000001";
    private static final String EMAIL = "mariama@example.gn";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    /**
     * @param contact the JSON body of `customer`, so each test can leave out
     *                exactly the field it is about
     */
    private static io.restassured.response.ValidatableResponse book(String at, String contact) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "k-" + UUID.randomUUID())
                .body("""
                      {"staff_id":"%s","service_offering_id":"%s","starts_at":"%s",
                       "customer":%s}
                      """.formatted(BookingFixtures.SALON_OWNER_STAFF,
                                    BookingFixtures.SALON_OFFERING, at, contact))
                .when().post(BOOK).then();
    }

    private static String withChannel(String channel) {
        return """
               {"full_name":"Mariama B.","phone":"%s","email":"%s",
                "preferred_channel":"%s"}
               """.formatted(PHONE, EMAIL, channel);
    }

    private List<NotificationRow> toCustomer() {
        return fixtures.notifications(BookingFixtures.SALON).stream()
                .filter(n -> "CUSTOMER".equals(n.recipientKind()))
                .toList();
    }

    @Test
    @DisplayName("Choosing email addresses every message the booking owes to the mailbox")
    void emailIsHonoured() {
        book(MORNING, withChannel("EMAIL")).statusCode(201);

        // The confirmation and both reminders. A reminder that came back by
        // WhatsApp for a booking confirmed by e-mail would be the platform
        // overruling the only person who knows what they read.
        assertThat(toCustomer()).hasSize(3).allSatisfy(n -> {
            assertThat(n.preferredChannel()).isEqualTo("EMAIL");
            assertThat(n.toEmail()).isEqualTo(EMAIL);
            // Both addresses travel regardless. The worker's role holds this
            // table and nothing else, so a row carrying only the chosen
            // address would leave it nothing to fall back to.
            assertThat(n.toPhone()).isEqualTo("+224622000001");
        });
    }

    @Test
    @DisplayName("Choosing WhatsApp is the same answer as saying nothing, and both are recorded")
    void whatsAppIsHonoured() {
        book(MORNING, withChannel("WHATSAPP")).statusCode(201);

        assertThat(toCustomer()).hasSize(3)
                .allSatisfy(n -> assertThat(n.preferredChannel()).isEqualTo("WHATSAPP"));
        assertThat(fixtures.appointmentChannels(BookingFixtures.SALON))
                .containsExactly("WHATSAPP");
    }

    @Test
    @DisplayName("Email with no address is refused at the edge, and nothing is written")
    void emailWithoutAnAddressIsRefused() {
        // 400 now, rather than a booking that succeeds and four rows a worker
        // discovers hours later with nothing in to_email, on a scheduled thread
        // that has nobody to answer. What the customer would have seen is a
        // confirmation that never arrives.
        book(MORNING, """
                      {"full_name":"Mariama B.","phone":"%s","preferred_channel":"EMAIL"}
                      """.formatted(PHONE))
                .statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));

        // Refused at the edge means refused before anything is written: no
        // appointment, no customer row, no outbox row.
        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isZero();
        assertThat(fixtures.customerPhones(BookingFixtures.SALON)).isEmpty();
        assertThat(fixtures.notifications(BookingFixtures.SALON)).isEmpty();
    }

    @Test
    @DisplayName("A blank address is no address, and is refused the same way")
    void aBlankAddressIsNoAddress() {
        // An empty string would otherwise satisfy "an email was given" while
        // the stored contact carried nothing at all.
        book(MORNING, """
                      {"full_name":"Mariama B.","phone":"%s","email":"  ",
                       "preferred_channel":"EMAIL"}
                      """.formatted(PHONE))
                .statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("A caller that names no channel still books, and still books on WhatsApp")
    void theFieldIsAdditive() {
        // Exactly the body every client sent before this field existed. It has
        // to keep meaning what it meant, inside one version of the API.
        book(MORNING, """
                      {"full_name":"Mariama B.","phone":"%s"}
                      """.formatted(PHONE))
                .statusCode(201);

        assertThat(fixtures.appointmentChannels(BookingFixtures.SALON))
                .containsExactly("WHATSAPP");
        assertThat(toCustomer()).hasSize(3)
                .allSatisfy(n -> assertThat(n.preferredChannel()).isEqualTo("WHATSAPP"));
    }

    @Test
    @DisplayName("A second booking on the same number does not rewrite what the first one asked for")
    void theChoiceBelongsToTheAppointment() {
        // The trap a standing preference on the customer row would have walked
        // into. One telephone number is one customers row forever - it is the
        // upsert key - so storing the answer there means the second booking
        // silently re-addresses everything the first still owes.
        book(MORNING, withChannel("EMAIL")).statusCode(201);
        book(AFTERNOON, """
                        {"full_name":"Mariama B.","phone":"%s"}
                        """.formatted(PHONE))
                .statusCode(201);

        // One customer, two appointments, two answers. Ordered by start.
        assertThat(fixtures.customerPhones(BookingFixtures.SALON)).hasSize(1);
        assertThat(fixtures.appointmentChannels(BookingFixtures.SALON))
                .containsExactly("EMAIL", "WHATSAPP");
    }

    @Test
    @DisplayName("The salon is written to the way the salon published, whatever its customer chose")
    void theProviderNoticeIsNotTheCustomersToChoose() {
        book(MORNING, withChannel("EMAIL")).statusCode(201);

        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .filteredOn(n -> "PROVIDER".equals(n.recipientKind()))
                .singleElement()
                .satisfies(n -> assertThat(n.preferredChannel()).isEqualTo("WHATSAPP"));
    }

    @Test
    @DisplayName("A cancellation days later goes the way that booking asked, not the way the last one did")
    void aLaterMessageUsesTheBookingsOwnAnswer() {
        String reference = book(MORNING, withChannel("EMAIL")).statusCode(201)
                .extract().path("reference");

        // The same number books again, differently. Under a standing
        // preference this is the moment September's answer would be lost.
        book(AFTERNOON, """
                        {"full_name":"Mariama B.","phone":"%s"}
                        """.formatted(PHONE))
                .statusCode(201);

        given().contentType("application/json").body("{}")
                .when().post("/v1/bookings/" + reference + "/cancellation")
                .then().statusCode(200);

        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .filteredOn(n -> "CANCELLATION".equals(n.kind()))
                .singleElement()
                .satisfies(n -> {
                    assertThat(n.preferredChannel()).isEqualTo("EMAIL");
                    assertThat(n.toEmail()).isEqualTo(EMAIL);
                });
    }
}
