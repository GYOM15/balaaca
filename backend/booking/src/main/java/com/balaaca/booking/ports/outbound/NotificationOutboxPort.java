package com.balaaca.booking.ports.outbound;

import com.balaaca.booking.domain.PlannedNotification;
import com.balaaca.sharedkernel.ids.AppointmentId;
import java.util.List;

/**
 * Appends rows to the transactional outbox. It appends, and that is all it can
 * do: no channel, no socket, no HTTP client is reachable through this port.
 *
 * <p>That restriction is the point. A send inside the booking transaction would
 * hold the appointment's row lock - and the exclusion-constraint range with it -
 * for as long as a gateway takes to answer, or to hang.
 */
public interface NotificationOutboxPort {

    /**
     * Writes the rows in the caller's transaction, so they commit with the state
     * change that owes them or not at all.
     *
     * <p>Silently absorbs a row whose dedupe key already exists: delivery is
     * at-least-once and planning is replayable, so a duplicate key is the index
     * doing its job, not an error.
     */
    void plan(List<PlannedNotification> notifications);

    /**
     * Withdraws what is no longer owed, in the caller's transaction.
     *
     * <p>A cancelled appointment whose reminder is still PENDING will text a
     * customer about something that no longer exists, hours after they were
     * told it was off. Withdrawing has to happen with the cancellation or not
     * at all: committed separately, a crash between the two leaves the reminder
     * armed.
     *
     * <p>Only PENDING rows move. One already SENDING belongs to a worker that
     * is mid-send, and one already SENT is gone - neither is ours to retract.
     */
    void cancelPending(AppointmentId appointmentId);
}
