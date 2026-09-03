package com.balaaca.booking.application;

import com.balaaca.booking.domain.ContactChannel;
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

    /**
     * Called inside the booking transaction, so these rows commit with it or
     * not at all.
     *
     * @param customerChannel the customer's own answer, already resolved and
     *                        already checked against the address it needs. It
     *                        governs the four CUSTOMER rows and none of the
     *                        provider's: a salon that published only a mailbox
     *                        is not reachable on WhatsApp because its customer
     *                        chose it
     */
    public void planFor(AppointmentId appointmentId,
                        String bookingReference,
                        Instant startsAt,
                        BookableOffering offering,
                        CustomerContact customer,
                        ContactChannel customerChannel) {

        NoticeProfile provider = providers.currentNoticeProfile();
        Instant now = clock.instant();

        // Three payloads, not one. They used to be the same map handed to all
        // four rows, which put the booking reference - the customer's ONLY way
        // back to this appointment, and the only thing that authorises
        // cancelling it - into the provider's notice and into both reminders.
        // The comment beside it said it went in the confirmation and nowhere
        // else; the code disagreed, and the code is what the worker drains.
        Map<String, String> forCustomer = customerPayload(provider, offering, customer, startsAt);
        Map<String, String> withReference = new java.util.LinkedHashMap<>(forCustomer);
        withReference.put("booking_reference", bookingReference);
        Map<String, String> forProvider = providerPayload(offering, customer, provider, startsAt);

        List<PlannedNotification> planned = new ArrayList<>();
        planned.add(confirmation(appointmentId, startsAt, now, customer, customerChannel,
                                 withReference));
        provider.noticeDestination()
                .map(to -> notice(appointmentId, startsAt, now, to, forProvider))
                .ifPresent(planned::add);
        // A booking taken an hour beforehand owes no day-before reminder. Writing
        // one anyway would make the worker send it the moment it drains, which
        // is a reminder about an appointment the customer is already walking to.
        reminder(appointmentId, startsAt, DAY_BEFORE, now, customer, customerChannel, forCustomer)
                .ifPresent(planned::add);
        reminder(appointmentId, startsAt, HOURS_BEFORE, now, customer, customerChannel, forCustomer)
                .ifPresent(planned::add);

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

    /**
     * What a change the CUSTOMER made owes the provider.
     *
     * <p>Planned by the customer's own path and nowhere else. A provider told
     * about their own cancellation is a provider learning to ignore the
     * channel, and the diary is where they see their own edits.
     *
     * <p>Silent when the provider published no way to be reached, exactly like
     * the booking notice: a business with no contact must still be bookable.
     */
    public void planCustomerChangeNotice(AgendaEntry changed, NotificationKind kind) {
        NoticeProfile provider = providers.currentNoticeProfile();

        provider.noticeDestination().ifPresent(to -> outbox.plan(List.of(
                new PlannedNotification(changed.id(), kind,
                        NotificationRecipient.PROVIDER,
                        to.phoneE164(), to.email(),
                        // The BUSINESS's channel, not the customer's. A salon
                        // that published only a mailbox is reached there
                        // whatever its customer asked for.
                        ContactChannel.reachableAt(to.phoneE164()), LOCALE,
                        // The provider's payload: whose appointment it is, not
                        // whose business. Their own name would tell them
                        // nothing, and the customer's number stays the row's
                        // destination rather than a variable - it is already in
                        // their agenda.
                        Map.of("customer_name", changed.customer().fullName(),
                               "service_name", changed.serviceName(),
                               "starts_at", changed.startsAt().toString(),
                               "starts_at_local", LOCAL_TIME.format(
                                       changed.startsAt().atZone(provider.timezone()))),
                        changed.startsAt(), clock.instant()))));
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
                // The appointment's own answer, given when it was booked. This
                // message is owed days or weeks later, and the address book
                // has one row per number that every later booking moves.
                cancelled.preferredChannel(),
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
                                                    ContactChannel channel,
                                                    Map<String, String> payload) {
        // Owed for the appointment's own start, not for now: the key has to be
        // recomputable, and a clock read is the one thing that is not. A
        // reschedule moves starts_at, so the moved booking earns a new key.
        return new PlannedNotification(id, NotificationKind.BOOKING_CONFIRMATION,
                NotificationRecipient.CUSTOMER,
                Optional.of(customer.phone().e164()), customer.email(),
                channel, LOCALE, payload, startsAt, now);
    }

    private static PlannedNotification notice(AppointmentId id, Instant startsAt, Instant now,
                                              NoticeProfile.NoticeDestination to,
                                              Map<String, String> payload) {
        return new PlannedNotification(id, NotificationKind.BOOKING_NOTICE,
                NotificationRecipient.PROVIDER,
                to.phoneE164(), to.email(),
                ContactChannel.reachableAt(to.phoneE164()),
                LOCALE, payload, startsAt, now);
    }

    private static Optional<PlannedNotification> reminder(AppointmentId id, Instant startsAt,
                                                          Duration before, Instant now,
                                                          CustomerContact customer,
                                                          ContactChannel channel,
                                                          Map<String, String> payload) {
        Instant owedFor = startsAt.minus(before);
        if (!owedFor.isAfter(now)) {
            return Optional.empty();
        }
        return Optional.of(new PlannedNotification(id, NotificationKind.REMINDER,
                NotificationRecipient.CUSTOMER,
                Optional.of(customer.phone().e164()), customer.email(),
                channel, LOCALE, payload, owedFor, owedFor));
    }

    /**
     * Stable English keys, and only what a message says. The customer's number
     * is the row's destination, not a variable: copying it into the provider's
     * payload would spread the same personal datum across a second column for
     * nothing the provider cannot already see in their own agenda.
     */
    /**
     * What a message TO THE CUSTOMER says.
     *
     * <p>Their own name is here: a message that opens with it is the one a
     * salon would write, and it is their datum in their own text.
     *
     * <p>The booking_reference is NOT. The confirmation adds it, once, because
     * that is the message which has to hand it over; a reminder that repeated
     * it would be a second row holding a capability at rest, and a reminder is
     * owed for a moment - it can be re-planned by a reschedule, so the copies
     * would multiply with the moves.
     */
    private static Map<String, String> customerPayload(NoticeProfile provider,
                                                       BookableOffering offering,
                                                       CustomerContact customer,
                                                       Instant startsAt) {
        return Map.of(
                "business_name", provider.businessName(),
                "service_name", offering.name(),
                "customer_name", customer.fullName(),
                "duration_minutes", String.valueOf(offering.duration().toMinutes()),
                "starts_at", startsAt.toString(),
                // The provider's zone, because a message that says 10:00 must
                // mean 10:00 where the appointment happens.
                "starts_at_local", LOCAL_TIME.format(startsAt.atZone(provider.timezone())));
    }

    /**
     * What the notice TO THE PROVIDER says.
     *
     * <p>The customer's name, because that is the useful part of "somebody
     * booked" - and never the reference, which is the customer's key to their
     * own appointment and gains the provider nothing they cannot read in their
     * agenda.
     */
    private static Map<String, String> providerPayload(BookableOffering offering,
                                                       CustomerContact customer,
                                                       NoticeProfile provider,
                                                       Instant startsAt) {
        return Map.of(
                "service_name", offering.name(),
                "customer_name", customer.fullName(),
                "duration_minutes", String.valueOf(offering.duration().toMinutes()),
                "starts_at", startsAt.toString(),
                "starts_at_local", LOCAL_TIME.format(startsAt.atZone(provider.timezone())));
    }
}
