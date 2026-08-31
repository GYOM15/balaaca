package com.balaaca.booking.application;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookingExceptions.AppointmentNotFoundException;
import com.balaaca.booking.domain.BookingExceptions.BookingContendedException;
import com.balaaca.booking.domain.BookingExceptions.InvalidStateTransitionException;
import com.balaaca.booking.domain.BookingExceptions.NotADropOffException;
import com.balaaca.booking.domain.BookingExceptions.PromiseBeforeHandoverException;
import com.balaaca.booking.domain.BookingExceptions.TransientBookingConflictException;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.inbound.MoveAppointmentUseCase;
import com.balaaca.booking.ports.outbound.AppointmentStateRepository;
import com.balaaca.sharedkernel.ids.AppointmentId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Clock;
import java.time.Instant;
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

    /** Enough to clear a deadlock storm; beyond it the system, not the slot, is the problem. */
    private static final int MAX_DEADLOCK_RETRIES = 3;

    private final AppointmentStateRepository appointments;
    private final Clock clock;
    private final BookingNotifications notifications;
    private final RescheduleAttempt rescheduleAttempt;

    public MoveAppointmentService(AppointmentStateRepository appointments,
                                  Clock clock,
                                  BookingNotifications notifications,
                                  RescheduleAttempt rescheduleAttempt) {
        this.appointments = appointments;
        this.clock = clock;
        this.notifications = notifications;
        this.rescheduleAttempt = rescheduleAttempt;
    }

    /**
     * Moves an appointment, retrying a deadlock rather than reporting one.
     *
     * <p>Not transactional itself: each attempt opens its own, because a
     * deadlock leaves the previous one rollback-only and every statement in it
     * would fail. The shape mirrors the booking path, which was built for
     * exactly this hazard while this path had neither the translation nor the
     * retry - and a provider dragging an appointment while a customer booked the
     * same window was told 500 INTERNAL_ERROR.
     *
     * <p>Retries are bounded. Past the bound the answer is a contended slot, not
     * a fault: the caller should re-read availability and try again, and saying
     * "internal error" would send them to look for a bug that is not there.
     */
    @Override
    public AgendaEntry reschedule(AppointmentId id, Instant newStartsAt,
                                 java.util.Optional<com.balaaca.sharedkernel.ids.StaffId> staff) {
        for (int attempt = 0; attempt <= MAX_DEADLOCK_RETRIES; attempt++) {
            try {
                return rescheduleAttempt.once(id, newStartsAt, staff);
            } catch (TransientBookingConflictException e) {
                if (attempt == MAX_DEADLOCK_RETRIES) {
                    throw new BookingContendedException(newStartsAt);
                }
            }
        }
        throw new BookingContendedException(newStartsAt);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry confirm(AppointmentId id) {
        // In this transaction, like every other notification: an acceptance
        // that committed while the transition rolled back would tell a customer
        // to come on a day the salon never agreed to.
        AgendaEntry accepted = move(id, EnumSet.of(AppointmentStatus.PENDING),
                                    AppointmentStatus.CONFIRMED);
        notifications.planAcceptance(accepted);
        return accepted;
    }

    /**
     * Says a dropped-off job is ready.
     *
     * <p>Idempotent in the statement rather than around it: a second call keeps
     * the first instant and returns the same row, because the customer was told
     * once. So the only refusals left are the two the UPDATE cannot satisfy, and
     * they are worked out from the snapshot only once it has found no row.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry markReady(AppointmentId id) {
        return appointments.markReady(id, clock.instant())
                .orElseThrow(() -> refusalForReadiness(id));
    }

    /**
     * Moves the promised date.
     *
     * <p>The statement refuses a date before the handover ended, so the two
     * possible refusals are told apart here from what the row actually says -
     * never from a constraint name, which tells a provider nothing.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry promiseFor(AppointmentId id, Instant readyBy) {
        return appointments.replaceReadyBy(id, readyBy, clock.instant())
                .orElseThrow(() -> refusalForPromise(id, readyBy));
    }

    private RuntimeException refusalForReadiness(AppointmentId id) {
        return appointments.snapshotOf(id)
                .<RuntimeException>map(s -> s.status() == AppointmentStatus.CANCELLED
                        ? new InvalidStateTransitionException(s.status(), s.status())
                        : new NotADropOffException(id.value()))
                .orElseGet(() -> new AppointmentNotFoundException(id.value()));
    }

    private RuntimeException refusalForPromise(AppointmentId id, Instant readyBy) {
        return appointments.snapshotOf(id)
                .<RuntimeException>map(s -> {
                    if (s.status() == AppointmentStatus.CANCELLED) {
                        return new InvalidStateTransitionException(s.status(), s.status());
                    }
                    // The snapshot carries the start, and the handover ends at
                    // start plus the service's own duration - but the row knows
                    // its own ends_at, and the statement already compared it.
                    // Reaching here with a plausible date means it was not a
                    // drop-off at all.
                    return readyBy.isBefore(s.startsAt())
                            ? new PromiseBeforeHandoverException(readyBy)
                            : new NotADropOffException(id.value());
                })
                .orElseGet(() -> new AppointmentNotFoundException(id.value()));
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

}
