package com.balaaca.booking.application;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingExceptions.AppointmentNotFoundException;
import com.balaaca.booking.domain.BookingExceptions.InvalidStateTransitionException;
import com.balaaca.booking.domain.BookingExceptions.SlotOutsideAvailabilityException;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.outbound.AppointmentStateRepository;
import com.balaaca.booking.ports.outbound.AppointmentStateRepository.AppointmentSnapshot;
import com.balaaca.booking.ports.outbound.NotificationOutboxPort;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.catalog.ports.inbound.LookupServiceOfferingUseCase;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase.SlotRequest;
import com.balaaca.sharedkernel.ids.AppointmentId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.Set;

/**
 * One attempt at moving an appointment, in its own transaction.
 *
 * <p>{@code REQUIRES_NEW} for the same reason {@link BookAppointmentAttempt} is:
 * a deadlock leaves the transaction rollback-only, so a retry inside it fails on
 * its first statement. Each attempt has to open its own.
 *
 * <p>This exists because the reschedule path contended on the same index as the
 * insert path and handled only half of what that produces. Measured on the
 * insert side, the loser's SQLSTATE is 40P01 at two, five and ten racers - not
 * 23P01 - and a provider dragging an appointment while a customer booked the
 * same window was answered 500 INTERNAL_ERROR, with the appointment silently
 * still at its old time.
 */
@ApplicationScoped
public class RescheduleAttempt {

    private static final Set<AppointmentStatus> MOVABLE =
            EnumSet.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED);

    private final AppointmentStateRepository appointments;
    private final LookupServiceOfferingUseCase offerings;
    private final CalculateSlotsUseCase slots;
    private final NotificationOutboxPort outbox;
    private final BookingNotifications notifications;
    private final Clock clock;

    public RescheduleAttempt(AppointmentStateRepository appointments,
                             LookupServiceOfferingUseCase offerings,
                             CalculateSlotsUseCase slots,
                             NotificationOutboxPort outbox,
                             BookingNotifications notifications,
                             Clock clock) {
        this.appointments = appointments;
        this.offerings = offerings;
        this.slots = slots;
        this.outbox = outbox;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public AgendaEntry once(AppointmentId id, Instant newStartsAt) {
        AppointmentSnapshot current = appointments.snapshotOf(id)
                .orElseThrow(() -> new AppointmentNotFoundException(id.value()));
        if (!MOVABLE.contains(current.status())) {
            throw new InvalidStateTransitionException(current.status(), current.status());
        }

        // Recomputed from the service the appointment already carries. The
        // client sends a start and nothing else about time; accepting an end or
        // a duration would let it shrink its own footprint and move inside
        // somebody else's appointment.
        BookableOffering offering = offerings.requireBookable(current.serviceOfferingId());
        BookedSlot moved = BookedSlot.from(newStartsAt, offering.duration(),
                                           offering.bufferBefore(), offering.bufferAfter());

        if (!slots.isWithinAvailability(newStartsAt, slotRequest(current, offering, newStartsAt))) {
            throw new SlotOutsideAvailabilityException(newStartsAt,
                    "outside the provider's declared availability");
        }

        // The UPDATE is still what decides. Everything above is the friendly
        // answer; the exclusion constraint is the guarantee, and a 23P01 here
        // surfaces as the same 409 a first booking would get.
        AgendaEntry entry = appointments.reschedule(id, moved, clock.instant())
                .orElseThrow(() -> new InvalidStateTransitionException(
                        current.status(), AppointmentStatus.PENDING));

        // The reminders for the old time are owed to nobody now, and the ones
        // for the new time have never been planned. Both in this transaction:
        // committed apart, a crash between them leaves a customer reminded of a
        // time that moved.
        outbox.cancelPending(id);
        notifications.planReschedule(entry);

        return entry;
    }

    private SlotRequest slotRequest(AppointmentSnapshot current, BookableOffering offering,
                                    Instant at) {
        LocalDate day = at.atZone(ZoneId.of("UTC")).toLocalDate();
        return new SlotRequest(offering.id(), java.util.Optional.of(current.staffId()),
                               day, day, offering.duration(),
                               offering.bufferBefore(), offering.bufferAfter());
    }
}
