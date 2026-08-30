package com.balaaca.booking.application;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookingExceptions.AppointmentNotFoundException;
import com.balaaca.booking.domain.BookingExceptions.InvalidStateTransitionException;
import com.balaaca.booking.ports.inbound.CancelAppointmentUseCase;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.outbound.AppointmentStateRepository;
import com.balaaca.booking.ports.outbound.NotificationOutboxPort;
import com.balaaca.sharedkernel.ids.AppointmentId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Clock;
import java.util.Optional;

/**
 * Cancels an appointment and withdraws what it owed.
 *
 * <p>One transaction for all of it. A cancellation that commits without
 * retracting its reminder leaves a customer being texted about an appointment
 * they were told was off - and committing the two separately means a crash
 * between them does exactly that.
 */
@ApplicationScoped
public class CancelAppointmentService implements CancelAppointmentUseCase {

    private final AppointmentStateRepository appointments;
    private final NotificationOutboxPort outbox;
    private final BookingNotifications notifications;
    private final Clock clock;

    public CancelAppointmentService(AppointmentStateRepository appointments,
                                    NotificationOutboxPort outbox,
                                    BookingNotifications notifications,
                                    Clock clock) {
        this.appointments = appointments;
        this.outbox = outbox;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry cancel(AppointmentId id, Optional<String> reason) {
        AgendaEntry cancelled = appointments.cancel(id, reason, clock.instant())
                .orElseThrow(() -> refusalFor(id));

        // Order matters only in that both are inside this transaction: the
        // reminder that is no longer owed is withdrawn, and the message that
        // now is gets planned.
        outbox.cancelPending(id);
        notifications.planCancellation(cancelled);

        return cancelled;
    }

    /**
     * Why nothing was updated. Asked only once the statement has found no row,
     * because until then it is not a question - and asking first would be the
     * read-modify-write the conditional UPDATE exists to avoid.
     *
     * <p>A row that is not the caller's is invisible to this read as well, so
     * it produces the same 404 as one that never existed. That is the point.
     */
    private RuntimeException refusalFor(AppointmentId id) {
        return appointments.snapshotOf(id)
                .<RuntimeException>map(current ->
                        new InvalidStateTransitionException(current.status(),
                                                            AppointmentStatus.CANCELLED))
                .orElseGet(() -> new AppointmentNotFoundException(id.value()));
    }
}
