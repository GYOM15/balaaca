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
    void scheduleRetry(java.util.UUID id, Instant nextAttemptAt, String failureCode);

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
