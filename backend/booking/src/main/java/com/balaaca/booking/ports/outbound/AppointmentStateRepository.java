package com.balaaca.booking.ports.outbound;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.sharedkernel.ids.AppointmentId;
import java.time.Instant;
import java.util.Optional;

/** Moves an appointment through its states, one conditional statement at a time. */
public interface AppointmentStateRepository {

    /**
     * Cancels, if the row is in a state that can be left.
     *
     * <p>One UPDATE whose WHERE clause carries the accepted states, so two
     * simultaneous cancellations produce one affected row and one zero - never
     * a read, a decision, and a write that a third request can slip between.
     *
     * <p>Cancelling also frees the slot, with no second statement: the exclusion
     * constraint is partial on the active statuses, so the row stops blocking
     * the moment its status changes. There is no window in which the slot is
     * neither taken nor free.
     *
     * @return the cancelled appointment, or empty when no row was in a
     *         cancellable state - which the caller must then tell apart from a
     *         row that is not theirs
     */
    Optional<AgendaEntry> cancel(AppointmentId id, Optional<String> reason, Instant at);

    /**
     * The current status, for telling a refusal apart from a miss.
     *
     * <p>Read only after a transition found no row. Empty means the appointment
     * does not exist or is not the caller's - and RLS makes those the same
     * answer, deliberately.
     */
    Optional<AppointmentStatus> statusOf(AppointmentId id);
}
