package com.balaaca.booking.application;

import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.domain.NotificationKind;
import com.balaaca.booking.domain.NotificationRecipient;
import com.balaaca.booking.domain.PlannedNotification;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.outbound.NotificationOutboxPort;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.providers.ports.inbound.LookupNoticeProfileUseCase;
import com.balaaca.providers.ports.inbound.NoticeProfile;
import com.balaaca.sharedkernel.ids.AppointmentId;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * What a new booking owes the outside world.
 *
 * <p>Its own class because it is its own reason to change: adding a reminder, or
 * changing what a message says, must not touch the attempt that books. The
 * attempt orchestrates one insert; this decides what that insert obliges.
 */
@ApplicationScoped
public class BookingNotifications {

    /**
     * Two reminders, at a day and at two hours. Constants rather than columns
     * because no provider can set them yet - a configurable schedule is a
     * feature, and inventing the column before the feature is inventing the
     * feature.
     */
    private static final Duration DAY_BEFORE = Duration.ofHours(24);
    private static final Duration HOURS_BEFORE = Duration.ofHours(2);

    /**
     * The column defaults to fr and no provider can choose otherwise yet. It is
     * passed explicitly all the same: a default in the schema is a fallback, not
     * a decision, and the row should say which language it was written for.
     */
    private static final String LOCALE = "fr";

    private static final DateTimeFormatter LOCAL_TIME =
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final LookupNoticeProfileUseCase providers;
    private final NotificationOutboxPort outbox;
    private final Clock clock;

    public BookingNotifications(LookupNoticeProfileUseCase providers,
                                NotificationOutboxPort outbox,
                                Clock clock) {
        this.providers = providers;
        this.outbox = outbox;
        this.clock = clock;
    }

    /** Called inside the booking transaction, so these rows commit with it or not at all. */
    public void planFor(AppointmentId appointmentId,
                        String bookingReference,
                        Instant startsAt,
                        BookableOffering offering,
                        CustomerContact customer) {

        NoticeProfile provider = providers.currentNoticeProfile();
        Instant now = clock.instant();
        Map<String, String> payload =
                payloadOf(provider, offering, customer, startsAt, bookingReference);

        List<PlannedNotification> planned = new ArrayList<>();
        planned.add(confirmation(appointmentId, startsAt, now, customer, payload));
        provider.noticeDestination()
                .map(to -> notice(appointmentId, startsAt, now, to, payload))
                .ifPresent(planned::add);
        // A booking taken an hour beforehand owes no day-before reminder. Writing
        // one anyway would make the worker send it the moment it drains, which
        // is a reminder about an appointment the customer is already walking to.
        reminder(appointmentId, startsAt, DAY_BEFORE, now, customer, payload).ifPresent(planned::add);
        reminder(appointmentId, startsAt, HOURS_BEFORE, now, customer, payload).ifPresent(planned::add);

        outbox.plan(planned);
    }

    /**
     * What a cancelled appointment owes: one message, to the customer, now.
     *
     * <p>Keyed on the appointment's start like the confirmation, so the pair
     * cannot collide and a replayed cancellation lands on the UNIQUE index
     * rather than on a second text.
     */
    public void planCancellation(AgendaEntry cancelled) {
        planOne(cancelled, NotificationKind.CANCELLATION);
    }

    private void planOne(AgendaEntry cancelled, NotificationKind kind) {
        NoticeProfile provider = providers.currentNoticeProfile();
        Map<String, String> payload = Map.of(
                "business_name", provider.businessName(),
                "service_name", cancelled.serviceName(),
                "customer_name", cancelled.customer().fullName(),
                "starts_at", cancelled.startsAt().toString(),
                "starts_at_local",
                LOCAL_TIME.format(cancelled.startsAt().atZone(provider.timezone())));

        outbox.plan(List.of(new PlannedNotification(
                cancelled.id(), kind,
                NotificationRecipient.CUSTOMER,
                Optional.of(cancelled.customer().phone().e164()), cancelled.customer().email(),
                LOCALE, payload, cancelled.startsAt(), clock.instant())));
    }

    /** What a moved appointment owes: one message, to the customer, now. */
    public void planReschedule(AgendaEntry moved) {
        planOne(moved, NotificationKind.RESCHEDULE);
    }

    /**
     * What an accepted appointment owes.
     *
     * <p>Only a provider that vets its bookings ever gets here - one that
     * confirms on arrival has nothing left to accept. Until this existed,
     * confirming notified nobody, so the customer of exactly those providers
     * waited for a message that was never written.
     */
    public void planAcceptance(AgendaEntry accepted) {
        planOne(accepted, NotificationKind.BOOKING_ACCEPTED);
    }

    private static PlannedNotification confirmation(AppointmentId id, Instant startsAt,
                                                    Instant now, CustomerContact customer,
                                                    Map<String, String> payload) {
        // Owed for the appointment's own start, not for now: the key has to be
        // recomputable, and a clock read is the one thing that is not. A
        // reschedule moves starts_at, so the moved booking earns a new key.
        return new PlannedNotification(id, NotificationKind.BOOKING_CONFIRMATION,
                NotificationRecipient.CUSTOMER,
                Optional.of(customer.phone().e164()), customer.email(),
                LOCALE, payload, startsAt, now);
    }

    private static PlannedNotification notice(AppointmentId id, Instant startsAt, Instant now,
                                              NoticeProfile.NoticeDestination to,
                                              Map<String, String> payload) {
        return new PlannedNotification(id, NotificationKind.BOOKING_NOTICE,
                NotificationRecipient.PROVIDER,
                to.phoneE164(), to.email(),
                LOCALE, payload, startsAt, now);
    }

    private static Optional<PlannedNotification> reminder(AppointmentId id, Instant startsAt,
                                                          Duration before, Instant now,
                                                          CustomerContact customer,
                                                          Map<String, String> payload) {
        Instant owedFor = startsAt.minus(before);
        if (!owedFor.isAfter(now)) {
            return Optional.empty();
        }
        return Optional.of(new PlannedNotification(id, NotificationKind.REMINDER,
                NotificationRecipient.CUSTOMER,
                Optional.of(customer.phone().e164()), customer.email(),
                LOCALE, payload, owedFor, owedFor));
    }

    /**
     * Stable English keys, and only what a message says. The customer's number
     * is the row's destination, not a variable: copying it into the provider's
     * payload would spread the same personal datum across a second column for
     * nothing the provider cannot already see in their own agenda.
     */
    private static Map<String, String> payloadOf(NoticeProfile provider,
                                                 BookableOffering offering,
                                                 CustomerContact customer,
                                                 Instant startsAt,
                                                 String bookingReference) {
        return Map.of(
                "business_name", provider.businessName(),
                "service_name", offering.name(),
                "customer_name", customer.fullName(),
                "duration_minutes", String.valueOf(offering.duration().toMinutes()),
                "starts_at", startsAt.toString(),
                // The provider's zone, because a message that says 10:00 must
                // mean 10:00 where the appointment happens.
                "starts_at_local", LOCAL_TIME.format(startsAt.atZone(provider.timezone())),
                // The customer's only way back to this appointment. It goes in
                // the confirmation and nowhere else - not in the reminder, not
                // in the provider's notice - because every extra copy is another
                // place a capability sits at rest.
                "booking_reference", bookingReference);
    }
}
