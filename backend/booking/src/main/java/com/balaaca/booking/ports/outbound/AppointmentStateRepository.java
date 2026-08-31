package com.balaaca.booking.ports.outbound;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;

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
     * Moves an appointment to another slot.
     *
     * <p>The window is recomputed by the caller from the service the
     * appointment already carries, and the exclusion constraint arbitrates the
     * result exactly as it does for a first booking: a 23P01 on this UPDATE is
     * the same 409 as a taken slot.
     *
     * <p>An UPDATE and not a delete-then-insert. Recreating the row would
     * change its id, break the audit trail, and open a window in which a third
     * party takes the freed slot.
     *
     * <p>The chair moves in the same statement when one is named. It has to be
     * the same statement: releasing the old resource and taking the new one as
     * two UPDATEs would leave a window in which the appointment holds both, or
     * neither, and the constraint would arbitrate against the wrong row.
     *
     * @param staffId empty leaves the appointment where it is, which is what a
     *                pure time move does
     * @return the moved appointment, or empty when no row was in a movable state
     */
    Optional<AgendaEntry> reschedule(AppointmentId id, BookedSlot slot,
                                     Optional<StaffId> staffId, Instant at);

    /**
     * Whether that staff member is one of this provider's own, and still there.
     *
     * <p>Active rather than bookable: bookable says customers may pick this
     * person on the public page, and a provider assigning work in their own
     * diary is not picking from that list. An owner who takes no public bookings
     * still cuts hair.
     *
     * <p>Asked before the move rather than left to the foreign key, so an
     * unknown chair is a 404 and not a 500 on a constraint name.
     */
    boolean activeStaffExists(StaffId staffId);

    /**
     * Applies one of the simple transitions.
     *
     * @param from  the states the move is legal from; the UPDATE carries them,
     *              so two racing callers produce one affected row and one zero
     * @return the appointment as it now stands, or empty when no row was in one
     *         of those states
     */
    Optional<AgendaEntry> transition(AppointmentId id, Set<AppointmentStatus> from,
                                     AppointmentStatus to, Instant at);

    /**
     * Records that a dropped-off job is ready.
     *
     * <p>One conditional UPDATE, and its WHERE carries every condition: the
     * appointment is a drop-off, it is not cancelled, and it has not already
     * been declared ready. Saying it twice keeps the FIRST instant, because the
     * customer was told once and a second date would move a fact.
     *
     * @return the appointment, or empty when no row met all of that - which the
     *         caller then has to tell apart from a row that is not theirs
     */
    Optional<AgendaEntry> markReady(AppointmentId id, Instant at);

    /**
     * Moves the promise.
     *
     * <p>"The machine broke, it will be Friday" is the most frequent event of
     * these trades. The UPDATE refuses a promise that falls before the handover
     * ended, so the check is in the statement rather than around it.
     */
    Optional<AgendaEntry> replaceReadyBy(AppointmentId id, Instant readyBy, Instant at);

    /**
     * What the caller needs to know about a row before touching it, and to tell
     * a refusal apart from a miss afterwards.
     *
     * <p>Empty means the appointment does not exist or is not the caller's -
     * and RLS makes those the same answer, deliberately.
     */
    Optional<AppointmentSnapshot> snapshotOf(AppointmentId id);

    /** Just enough to recompute a slot and to judge a transition. */
    record AppointmentSnapshot(AppointmentId id,
                               ServiceOfferingId serviceOfferingId,
                               StaffId staffId,
                               AppointmentStatus status,
                               Instant startsAt) {
    }
}
