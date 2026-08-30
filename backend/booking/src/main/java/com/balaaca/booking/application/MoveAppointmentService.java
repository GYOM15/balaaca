package com.balaaca.booking.application;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingExceptions.AppointmentNotFoundException;
import com.balaaca.booking.domain.BookingExceptions.InvalidStateTransitionException;
import com.balaaca.booking.domain.BookingExceptions.SlotOutsideAvailabilityException;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.inbound.MoveAppointmentUseCase;
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
import java.util.Optional;
import java.util.Set;

/**
 * Everything an appointment can become after it exists, apart from cancelled.
 *
 * <p>Every transition is one conditional UPDATE carrying the states it accepts,
 * so two callers racing on the same appointment produce one affected row and one
 * zero. Nothing here reads a status, decides, and then writes.
 */
@ApplicationScoped
public class MoveAppointmentService implements MoveAppointmentUseCase {

    private static final Set<AppointmentStatus> MOVABLE =
            EnumSet.of(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED);

    private final AppointmentStateRepository appointments;
    private final LookupServiceOfferingUseCase offerings;
    private final CalculateSlotsUseCase slots;
    private final NotificationOutboxPort outbox;
    private final BookingNotifications notifications;
    private final Clock clock;

    public MoveAppointmentService(AppointmentStateRepository appointments,
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

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry reschedule(AppointmentId id, Instant newStartsAt) {
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
                .orElseThrow(() -> refusalFor(id, AppointmentStatus.PENDING));

        // The reminders for the old time are owed to nobody now, and the ones
        // for the new time have never been planned. Both in this transaction:
        // committed apart, a crash between them leaves a customer reminded of a
        // time that moved.
        outbox.cancelPending(id);
        notifications.planReschedule(entry);

        return entry;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry confirm(AppointmentId id) {
        return move(id, EnumSet.of(AppointmentStatus.PENDING), AppointmentStatus.CONFIRMED);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry complete(AppointmentId id) {
        return move(id, EnumSet.of(AppointmentStatus.CONFIRMED), AppointmentStatus.COMPLETED);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry markNoShow(AppointmentId id) {
        return move(id, EnumSet.of(AppointmentStatus.CONFIRMED), AppointmentStatus.NO_SHOW);
    }

    private AgendaEntry move(AppointmentId id, Set<AppointmentStatus> from, AppointmentStatus to) {
        return appointments.transition(id, from, to, clock.instant())
                .orElseThrow(() -> refusalFor(id, to));
    }

    /**
     * Why nothing moved. Asked only once the statement has found no row: before
     * that it is not a question, and asking first would be the read-modify-write
     * the conditional UPDATE exists to avoid.
     *
     * <p>A row that is not the caller's is invisible to this read too, so it
     * gives the same 404 as one that never existed.
     */
    private RuntimeException refusalFor(AppointmentId id, AppointmentStatus wanted) {
        return appointments.snapshotOf(id)
                .<RuntimeException>map(s -> new InvalidStateTransitionException(s.status(), wanted))
                .orElseGet(() -> new AppointmentNotFoundException(id.value()));
    }

    private static SlotRequest slotRequest(AppointmentSnapshot current, BookableOffering offering,
                                           Instant newStartsAt) {
        // The appointment keeps its staff member: a reschedule moves a time, not
        // a person. Naming them also makes the availability question the right
        // one - is THIS chair free then, not is any chair.
        LocalDate day = newStartsAt.atZone(ZoneId.of("UTC")).toLocalDate();
        return new SlotRequest(current.serviceOfferingId(), Optional.of(current.staffId()),
                day.minusDays(1), day.plusDays(1),
                offering.duration(), offering.bufferBefore(), offering.bufferAfter());
    }
}
