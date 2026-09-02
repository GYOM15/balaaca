package com.balaaca.notificationworker.ports;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import java.time.Instant;
import java.util.List;

/** The four things a drain loop does to the table, and nothing else. */
public interface NotificationOutbox {

    /**
     * Marks a batch SENDING and returns it, in one transaction that commits
     * before any send begins.
     *
     * <p>{@code FOR UPDATE SKIP LOCKED}, so a second replica walks past the rows
     * this one holds instead of waiting for them and then sending them twice.
     */
    List<ClaimedNotification> claimDue(int batchSize);

    /** Only after the channel has acknowledged. Before it, a failed send would read as delivered. */
    void markSent(java.util.UUID id, Channel channel, Instant sentAt);

    /** Increments the attempt, pushes the row out, and turns it DEAD at its cap. */
    /**
     * @return true when this attempt was the last one and the row is now DEAD.
     *         The caller has to know, because a message that dies in silence is
     *         a message nobody ever finds out about - and the outbox doctrine
     *         asks for the opposite in as many words.
     */
    boolean scheduleRetry(java.util.UUID id, Instant nextAttemptAt, String failureCode);

    /**
     * Terminal at once, without spending the attempt budget first.
     *
     * <p>{@link #scheduleRetry} reaches DEAD by exhausting attempts, which is
     * right for a gateway that might answer next time. It is wrong for a row
     * that no transport could ever address: retrying that sixteen times over
     * an hour changes nothing, delays the alert, and fills the log with a
     * failure that was already final on the first read of the row.
     *
     * <p>The attempt is still counted. A DEAD row showing zero attempts reads
     * as one nothing ever touched, which invites somebody to put it back to
     * PENDING and watch it die again.
     */
    void markDead(java.util.UUID id, String failureCode);

    /**
     * Returns rows a worker claimed and never finished to PENDING.
     *
     * <p>A process killed mid-send leaves a row SENDING for ever otherwise.
     * Delivery is at-least-once by contract, so releasing a stale lease may
     * replay a send. Whether that costs a duplicate depends on the channel:
     * WhatsApp has no idempotency key and will deliver twice.
     *
     * @return how many were released
     */
    int releaseStaleLeases(java.time.Duration olderThan);
}
