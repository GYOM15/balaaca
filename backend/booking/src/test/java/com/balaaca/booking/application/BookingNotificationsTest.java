package com.balaaca.booking.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.domain.NotificationKind;
import com.balaaca.booking.domain.NotificationRecipient;
import com.balaaca.booking.domain.PlannedNotification;
import com.balaaca.booking.ports.outbound.NotificationOutboxPort;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.providers.ports.inbound.LookupNoticeProfileUseCase;
import com.balaaca.providers.ports.inbound.NoticeProfile;
import com.balaaca.providers.ports.inbound.NoticeProfile.NoticeDestination;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import com.balaaca.sharedkernel.phone.PhoneNumber;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * What a booking owes, decided against a fixed clock.
 *
 * <p>The rules worth pinning here are all time-shaped - which reminders survive
 * a late booking, and what makes a dedupe key reproducible - and none of them
 * needs a database to be wrong. The IT proves the rows land in the booking's
 * transaction; this proves they are the right rows.
 */
class BookingNotificationsTest {

    /** The capability the confirmation carries. Any opaque string does here. */
    private static final String REFERENCE = "cGFzLXVuLXZyYWktc2VjcmV0LWRlLXRlc3Q";

    private static final Instant NOW = Instant.parse("2026-09-01T08:00:00Z");
    private static final AppointmentId APPOINTMENT =
            AppointmentId.of(UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001"));

    /** Collects what the planner decided, instead of writing it. */
    private static final class RecordingOutbox implements NotificationOutboxPort {
        private final List<PlannedNotification> planned = new ArrayList<>();

        @Override
        public void plan(List<PlannedNotification> notifications) {
            planned.addAll(notifications);
        }

        @Override
        public void cancelPending(com.balaaca.sharedkernel.ids.AppointmentId appointmentId) {
            throw new UnsupportedOperationException(
                    "planning owes nothing to withdrawal; a test that reached here "
                    + "would be asserting the wrong thing");
        }
    }

    private final RecordingOutbox outbox = new RecordingOutbox();

    private static BookableOffering offering() {
        return new BookableOffering(
                ServiceOfferingId.of(UUID.fromString("5e111111-0000-0000-0000-000000000001")),
                "Tresses", Duration.ofMinutes(60), Duration.ofMinutes(15), Duration.ofMinutes(10),
                Optional.empty(),
                com.balaaca.catalog.ports.inbound.ServiceLocation.AT_PROVIDER,
                Money.ofMinor(150000, Currency.of("GNF")));
    }

    private static CustomerContact customer() {
        return new CustomerContact("Mariama B.", new PhoneNumber("+224622000001"), Optional.empty());
    }

    private BookingNotifications plannerFor(NoticeProfile profile) {
        LookupNoticeProfileUseCase providers = () -> profile;
        return new BookingNotifications(providers, outbox,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static NoticeProfile reachable() {
        return new NoticeProfile("Salon Fatou", ZoneId.of("Africa/Conakry"), "GN",
                Optional.of(new NoticeDestination(Optional.of("+224622999001"), Optional.empty())));
    }

    private static NoticeProfile unreachable() {
        return new NoticeProfile("Coiffeur Solo", ZoneId.of("Africa/Conakry"), "GN",
                                 Optional.empty());
    }

    private List<PlannedNotification> planFor(NoticeProfile profile, Instant startsAt) {
        plannerFor(profile).planFor(APPOINTMENT, REFERENCE, startsAt, offering(), customer());
        return outbox.planned;
    }

    @Nested
    @DisplayName("A booking well ahead of time")
    class WellAhead {

        private static final Instant STARTS_AT = Instant.parse("2026-09-04T10:00:00Z");

        @Test
        @DisplayName("owes a confirmation, a staff notice and two reminders")
        void plansFour() {
            assertThat(planFor(reachable(), STARTS_AT))
                    .extracting(PlannedNotification::kind)
                    .containsExactly(NotificationKind.BOOKING_CONFIRMATION,
                                     NotificationKind.BOOKING_NOTICE,
                                     NotificationKind.REMINDER,
                                     NotificationKind.REMINDER);
        }

        @Test
        @DisplayName("addresses the customer and the provider at their own numbers")
        void addressesEachRecipient() {
            List<PlannedNotification> planned = planFor(reachable(), STARTS_AT);

            assertThat(planned).filteredOn(n -> n.recipient() == NotificationRecipient.PROVIDER)
                    .singleElement()
                    .satisfies(n -> assertThat(n.toPhoneE164()).contains("+224622999001"));
            assertThat(planned).filteredOn(n -> n.recipient() == NotificationRecipient.CUSTOMER)
                    .allSatisfy(n -> assertThat(n.toPhoneE164()).contains("+224622000001"));
        }

        @Test
        @DisplayName("tells the two reminders apart by the instant each is owed for")
        void reminderKeysDifferByInstant() {
            List<String> keys = planFor(reachable(), STARTS_AT).stream()
                    .filter(n -> n.kind() == NotificationKind.REMINDER)
                    .map(PlannedNotification::dedupeKey)
                    .toList();

            // 2026-09-03T10:00Z and 2026-09-04T08:00Z, as epoch seconds. Same
            // kind, same appointment, two rows - and nothing incrementing.
            assertThat(keys).containsExactly(
                    "appointment:aaaaaaaa-0000-0000-0000-000000000001:REMINDER:1788429600",
                    "appointment:aaaaaaaa-0000-0000-0000-000000000001:REMINDER:1788508800");
        }

        @Test
        @DisplayName("keys the confirmation on the appointment's start, never on the clock")
        void confirmationKeyIsReproducible() {
            String first = planFor(reachable(), STARTS_AT).get(0).dedupeKey();

            // A second planning of the same booking - a replayed transaction -
            // has to produce the identical key for the UNIQUE index to absorb it.
            outbox.planned.clear();
            assertThat(planFor(reachable(), STARTS_AT).get(0).dedupeKey()).isEqualTo(first);
            assertThat(first).endsWith(":BOOKING_CONFIRMATION:" + STARTS_AT.getEpochSecond());
        }

        @Test
        @DisplayName("freezes what the message says, in the provider's own zone")
        void payloadIsSelfContained() {
            assertThat(planFor(reachable(), STARTS_AT).get(0).payload())
                    .containsEntry("business_name", "Salon Fatou")
                    .containsEntry("service_name", "Tresses")
                    .containsEntry("customer_name", "Mariama B.")
                    .containsEntry("duration_minutes", "60")
                    .containsEntry("starts_at_local", "04/09/2026 10:00");
        }

        @Test
        @DisplayName("hands the reference to the confirmation and to nothing else")
        void theReferenceIsNotCopiedAround() {
            List<PlannedNotification> planned = planFor(reachable(), STARTS_AT);

            // Four rows are written: the confirmation, the provider's notice,
            // and two reminders. They used to share ONE map, so the reference -
            // the customer's only way back to this appointment, and the only
            // thing that authorises cancelling it - sat in all four. The
            // comment beside it claimed otherwise; this asserts it.
            assertThat(planned).hasSizeGreaterThan(1);
            assertThat(planned.stream()
                    .filter(p -> p.payload().containsKey("booking_reference"))
                    .map(PlannedNotification::kind))
                    .containsExactly(NotificationKind.BOOKING_CONFIRMATION);
        }

        @Test
        @DisplayName("never puts the customer's reference in the provider's notice")
        void theProviderGetsNoCapability() {
            PlannedNotification notice = planFor(reachable(), STARTS_AT).stream()
                    .filter(p -> p.recipient() == NotificationRecipient.PROVIDER)
                    .findFirst().orElseThrow();

            assertThat(notice.payload()).doesNotContainKey("booking_reference");
            // What the provider does need: who booked, and for what.
            assertThat(notice.payload())
                    .containsEntry("customer_name", "Mariama B.")
                    .containsEntry("service_name", "Tresses");
        }
    }

    @Nested
    @DisplayName("A booking taken late")
    class Late {

        @Test
        @DisplayName("skips the reminder whose moment has already passed")
        void skipsTheDayBefore() {
            // Six hours out: the day-before reminder was owed yesterday, and
            // writing it would have the worker send it on its next drain - a
            // reminder for an appointment the customer is nearly at.
            assertThat(planFor(reachable(), NOW.plus(Duration.ofHours(6))))
                    .extracting(PlannedNotification::kind)
                    .containsExactly(NotificationKind.BOOKING_CONFIRMATION,
                                     NotificationKind.BOOKING_NOTICE,
                                     NotificationKind.REMINDER);
        }

        @Test
        @DisplayName("skips both reminders when even the last one has passed")
        void skipsBoth() {
            assertThat(planFor(reachable(), NOW.plus(Duration.ofMinutes(90))))
                    .extracting(PlannedNotification::kind)
                    .containsExactly(NotificationKind.BOOKING_CONFIRMATION,
                                     NotificationKind.BOOKING_NOTICE);
        }
    }

    @Test
    @DisplayName("A provider who published no contact still gets the booking, just no notice")
    void unreachableProviderPlansNoNotice() {
        assertThat(planFor(unreachable(), Instant.parse("2026-09-04T10:00:00Z")))
                .extracting(PlannedNotification::kind)
                .doesNotContain(NotificationKind.BOOKING_NOTICE)
                .hasSize(3);
    }
}
