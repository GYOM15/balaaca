package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a customer can do after they have booked.
 *
 * <p>Until this existed the answer was nothing. Six public routes - search,
 * page, hours, team, slots, book - and not one for looking at what you booked or
 * calling it off, so the customer telephoned the salon. That is the thing this
 * product exists to remove.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class CustomerBookingIT {

    private static final String BOOK = "/v1/providers/salon-fatou/appointments";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String book(String startsAt) {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"%s",
                       "customer":{"full_name":"Mariama B.","phone":"622000001"}}
                      """.formatted(BookingFixtures.SALON_OFFERING, startsAt))
                .when().post(BOOK).then().statusCode(201)
                .extract().jsonPath().getString("reference");
    }

    @Test
    @DisplayName("Booking hands back a reference, and it opens the booking")
    void returnsAReferenceThatWorks() {
        String reference = book("2026-09-04T10:00:00Z");

        assertThat(reference).isNotBlank().hasSize(43);

        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("reference", equalTo(reference))
                .body("provider_slug", equalTo("salon-fatou"))
                .body("provider_name", equalTo("Salon Fatou"))
                .body("service_name", equalTo("Tresses"))
                .body("staff_name", equalTo("Fatou"))
                .body("status", equalTo("PENDING"))
                .body("price.amount_minor", equalTo(150000))
                // The instants are UTC and mean nothing to a reader without
                // this: "14:00" is the time at the salon, not where the phone is.
                .body("timezone", equalTo("Africa/Conakry"))
                .body("cancellable_until", notNullValue());
    }

    @Test
    @DisplayName("The reference is not the appointment's identifier")
    void doesNotHandBackASecondWayIn() {
        String reference = book("2026-09-04T10:00:00Z");

        var body = given().when().get("/v1/bookings/" + reference)
                .then().statusCode(200).extract().body().asString();

        // The id is on the provider's agenda, in the audit trail and in log
        // lines. A capability has to be a value whose only job is to be one.
        assertThat(body)
                .doesNotContain("appointment_id")
                .doesNotContain("staff_id")
                .doesNotContain("customer_id");
    }

    @Test
    @DisplayName("A replayed booking gets the same reference, not a second one")
    void replaysTheSameReference() {
        String key = "key-" + UUID.randomUUID();
        String body = """
                      {"service_offering_id":"%s","starts_at":"2026-09-04T10:00:00Z",
                       "customer":{"full_name":"Mariama B.","phone":"622000001"}}
                      """.formatted(BookingFixtures.SALON_OFFERING);

        String first = given().contentType("application/json").header("Idempotency-Key", key)
                .body(body).when().post(BOOK).then().statusCode(201)
                .extract().jsonPath().getString("reference");

        // A retry that came back with a different reference would leave the
        // customer holding a key to nothing.
        String replayed = given().contentType("application/json").header("Idempotency-Key", key)
                .body(body).when().post(BOOK).then().statusCode(200)
                .extract().jsonPath().getString("reference");

        assertThat(replayed).isEqualTo(first);
    }

    @Test
    @DisplayName("A reference nobody minted is a 404")
    void refusesAnUnknownReference() {
        given().when().get("/v1/bookings/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                .then().statusCode(404).body("code", equalTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("A customer calls their own appointment off")
    void cancelsTheirOwnBooking() {
        String reference = book("2026-09-04T10:00:00Z");

        given().contentType("application/json").body("{\"reason\":\"empechement\"}")
                .when().post("/v1/bookings/" + reference + "/cancellation")
                .then().statusCode(200)
                .body("status", equalTo("CANCELLED"))
                // No longer offered, because it can no longer be done.
                .body("cancellable_until", nullValue());

        // And the slot is free again: the exclusion constraint is partial on the
        // active statuses, so cancelling releases it with no second statement.
        assertThat(fixtures.activeAppointments(BookingFixtures.SALON)).isZero();
    }

    @Test
    @DisplayName("Cancelling twice is refused, not silently repeated")
    void refusesASecondCancellation() {
        String reference = book("2026-09-04T10:00:00Z");

        given().contentType("application/json").body("{}")
                .when().post("/v1/bookings/" + reference + "/cancellation")
                .then().statusCode(200);
        given().contentType("application/json").body("{}")
                .when().post("/v1/bookings/" + reference + "/cancellation")
                .then().statusCode(409).body("code", equalTo("INVALID_STATE_TRANSITION"));
    }

    @Test
    @DisplayName("Past the provider's notice period, the customer telephones")
    void refusesACancellationInsideTheDeadline() {
        String reference = book("2026-09-04T10:00:00Z");

        // The salon asks for two hours' notice by default. Moving the
        // appointment to one hour from now puts the caller inside it.
        fixtures.execute("""
                UPDATE appointments
                   SET starts_at = now() + interval '1 hour',
                       ends_at = now() + interval '2 hours',
                       blocked_from = now() + interval '45 minutes',
                       blocked_until = now() + interval '2 hours 10 minutes'
                 WHERE public_reference = '%s'
                """.formatted(reference));

        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                // Said in advance, so a client need not offer a button that
                // answers 422.
                .body("cancellable_until", nullValue());

        given().contentType("application/json").body("{}")
                .when().post("/v1/bookings/" + reference + "/cancellation")
                .then().statusCode(422)
                .body("code", equalTo("CANCELLATION_DEADLINE_PASSED"));
    }

    @Test
    @DisplayName("A suspended business answers 404, published or not")
    void hidesABookingOfASuspendedProvider() {
        String reference = book("2026-09-04T10:00:00Z");

        fixtures.execute("UPDATE providers SET status = 'SUSPENDED' WHERE slug = 'salon-fatou'");

        given().when().get("/v1/bookings/" + reference).then().statusCode(404);
    }

    @Test
    @DisplayName("Unpublishing does not strand a customer who already booked")
    void keepsWorkingWhenTheProviderUnpublishes() {
        String reference = book("2026-09-04T10:00:00Z");

        // The salon took the booking. Taking its page down is not a reason to
        // stop answering the person who is holding an appointment.
        fixtures.execute("UPDATE providers SET published = false WHERE slug = 'salon-fatou'");

        given().when().get("/v1/providers/salon-fatou").then().statusCode(404);
        given().when().get("/v1/bookings/" + reference).then().statusCode(200)
                .body("status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("A customer can move their own appointment")
    void movesItsOwnBooking() {
        // The half this capability was missing. Without it, somebody who needed
        // Thursday instead of Friday had to cancel - releasing the slot to
        // whoever refreshed the page first - and book again.
        String reference = book("2026-09-04T10:00:00Z");

        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-05T14:00:00Z\"}")
                .when().post("/v1/bookings/" + reference + "/reschedule")
                .then().statusCode(200)
                .body("starts_at", equalTo("2026-09-05T14:00:00Z"))
                // One hour of Tresses, and the reference is unchanged: it is
                // the same appointment, and every message already sent names it.
                .body("ends_at", equalTo("2026-09-05T15:00:00Z"))
                .body("reference", equalTo(reference));
    }

    @Test
    @DisplayName("Moving onto a taken slot is refused, not silently reassigned")
    void aTakenSlotIsRefused() {
        String mine = book("2026-09-04T10:00:00Z");
        book("2026-09-04T14:00:00Z");

        // Somebody who asked for Fatou and was quietly moved to Mariama would
        // find out in the chair.
        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-04T14:00:00Z\"}")
                .when().post("/v1/bookings/" + mine + "/reschedule")
                .then().statusCode(409);
    }

    @Test
    @DisplayName("Moving outside the shop's hours is refused")
    void aClosedHourIsRefused() {
        String reference = book("2026-09-04T10:00:00Z");

        // Three in the morning. The salon opens at eight.
        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-05T03:00:00Z\"}")
                .when().post("/v1/bookings/" + reference + "/reschedule")
                .then().statusCode(422)
                .body("code", equalTo("SLOT_OUTSIDE_AVAILABILITY"));
    }

    @Test
    @DisplayName("Past the notice period a move is as refused as a cancellation")
    void theDeadlineBindsBothHalves() {
        String reference = book("2026-09-04T10:00:00Z");
        fixtures.execute("""
                UPDATE appointments
                   SET starts_at = now() + interval '1 hour',
                       ends_at = now() + interval '2 hours',
                       blocked_from = now() + interval '45 minutes',
                       blocked_until = now() + interval '2 hours 10 minutes'
                 WHERE public_reference = '%s'
                """.formatted(reference));

        // The same disruption: a chair emptied an hour before it was due is
        // emptied whether or not something is put in its place. Otherwise the
        // deadline would be one cancel-and-rebook away from meaningless.
        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-05T14:00:00Z\"}")
                .when().post("/v1/bookings/" + reference + "/reschedule")
                .then().statusCode(422)
                .body("code", equalTo("CANCELLATION_DEADLINE_PASSED"));
    }

    @Test
    @DisplayName("A reference naming nothing moves nothing")
    void anUnknownReferenceIs404() {
        // Well formed and simply not minted, so the refusal comes from the
        // lookup rather than from the path's own pattern - which is the case
        // worth pinning: a reference that never binds a tenant must answer 404
        // and not reach anything.
        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-05T14:00:00Z\"}")
                .when().post("/v1/bookings/"
                             + "ThisReferenceWasNeverMintedByAnybodyAtAll_00/reschedule")
                .then().statusCode(404);
    }

    @Test
    @DisplayName("The salon is told when its customer calls off or moves")
    void theProviderHearsAboutIt() {
        String reference = book("2026-09-04T10:00:00Z");
        given().contentType("application/json").body("{}")
                .when().post("/v1/bookings/" + reference + "/cancellation")
                .then().statusCode(200);

        // Before this the salon learned by opening the diary, so a chair freed
        // an hour ahead stayed blocked in the owner's head and a walk-in was
        // turned away.
        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .extracting(BookingFixtures.NotificationRow::kind,
                            BookingFixtures.NotificationRow::recipientKind)
                .contains(org.assertj.core.groups.Tuple.tuple("CANCELLATION_NOTICE", "PROVIDER"));

        String moved = book("2026-09-04T11:00:00Z");
        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-05T14:00:00Z\"}")
                .when().post("/v1/bookings/" + moved + "/reschedule")
                .then().statusCode(200);

        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .extracting(BookingFixtures.NotificationRow::kind,
                            BookingFixtures.NotificationRow::recipientKind)
                .contains(org.assertj.core.groups.Tuple.tuple("RESCHEDULE_NOTICE", "PROVIDER"));
    }

    @Test
    @DisplayName("A provider moving its own diary is not texted about it")
    void theProviderIsNotToldAboutItsOwnEdits() {
        // A provider told about their own action is a provider learning to
        // ignore the channel. AppointmentLifecycleIT drives the provider path;
        // here it is enough that the customer path is the only producer.
        book("2026-09-04T10:00:00Z");

        assertThat(fixtures.notifications(BookingFixtures.SALON))
                .extracting(BookingFixtures.NotificationRow::kind)
                .doesNotContain("CANCELLATION_NOTICE", "RESCHEDULE_NOTICE");
    }

    @Test
    @DisplayName("One reference reaches one booking and no other")
    void reachesOnlyItsOwnBooking() {
        String mine = book("2026-09-04T10:00:00Z");
        String theirs = given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-04T09:00:00Z",
                       "customer":{"full_name":"Autre","phone":"622000002"}}
                      """.formatted(BookingFixtures.SOLO_OFFERING))
                .when().post("/v1/providers/coiffeur-solo/appointments")
                .then().statusCode(201).extract().jsonPath().getString("reference");

        given().when().get("/v1/bookings/" + mine).then().statusCode(200)
                .body("provider_slug", equalTo("salon-fatou"));
        given().when().get("/v1/bookings/" + theirs).then().statusCode(200)
                .body("provider_slug", equalTo("coiffeur-solo"));
    }
}
