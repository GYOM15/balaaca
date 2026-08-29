package com.balaaca.notificationworker.application;

import com.balaaca.notificationworker.domain.Backoff;
import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.NotificationChannel;
import com.balaaca.notificationworker.ports.NotificationChannel.ChannelException;
import com.balaaca.notificationworker.ports.NotificationOutbox;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.scheduler.Scheduled;
import io.quarkus.scheduler.Scheduled.ConcurrentExecution;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.inject.Instance;
import java.time.Clock;
import java.time.Duration;
import java.util.random.RandomGenerator;
import org.jboss.logging.Logger;
import org.jboss.logging.MDC;

/**
 * Claims what is due, sends it, and records what happened.
 *
 * <p>No tenant is bound anywhere in here, and none can be: TenantContext is
 * request-scoped and a scheduled drain has no request. The worker does not need
 * one - its own RLS policy is what admits the rows, and the row itself carries
 * everything the send needs.
 */
@ApplicationScoped
public class NotificationDrainJob {

    private static final Logger LOG = Logger.getLogger(NotificationDrainJob.class);

    /** Large enough to amortise the claim, small enough that a crash strands little. */
    private static final int BATCH = 50;

    /** A row held longer than this belongs to a process that is not coming back. */
    private static final Duration LEASE = Duration.ofMinutes(5);

    private final NotificationOutbox outbox;
    private final Instance<NotificationChannel> channel;
    private final Backoff backoff;
    private final Clock clock;

    public NotificationDrainJob(NotificationOutbox outbox,
                                Instance<NotificationChannel> channel,
                                Clock clock) {
        this.outbox = outbox;
        this.channel = channel;
        this.backoff = new Backoff(RandomGenerator.getDefault());
        this.clock = clock;
    }

    /**
     * Fail at startup rather than at the first drain. A worker with no channel
     * would otherwise run happily, claim rows, throw on each, and burn every
     * attempt until the whole backlog is DEAD.
     */
    void requireAChannel(@Observes StartupEvent startup) {
        if (!channel.isResolvable()) {
            throw new IllegalStateException(
                    "balaaca.notification.channel names no available channel; "
                    + "the worker will not run without one");
        }
    }

    @Scheduled(every = "{balaaca.notification.drain-interval:5s}",
               concurrentExecution = ConcurrentExecution.SKIP)
    public void drain() {
        for (ClaimedNotification n : outbox.claimDue(BATCH)) {
            // provider_id is operational and goes to the log raw; nothing about
            // the recipient does.
            MDC.put("provider_id", n.providerId().toString());
            try {
                dispatch(n);
            } finally {
                MDC.remove("provider_id");
            }
        }
    }

    /**
     * A row left SENDING is a row nothing will ever pick up again. Releasing the
     * lease may replay a send that had in fact gone out; delivery is
     * at-least-once by contract and the dedupe key is the channel's own
     * idempotency key, so the cost is a suppressed duplicate rather than a
     * message lost for good.
     */
    @Scheduled(every = "{balaaca.notification.reap-interval:60s}",
               concurrentExecution = ConcurrentExecution.SKIP)
    public void releaseStaleLeases() {
        int released = outbox.releaseStaleLeases(LEASE);
        if (released > 0) {
            LOG.warnf("notification.lease.released count=%d", released);
        }
    }

    private void dispatch(ClaimedNotification n) {
        try {
            // The dedupe key doubles as the channel's idempotency key: a crash
            // between the acknowledgement and markSent replays the send, and the
            // gateway suppresses it instead of sending twice.
            Channel used = channel.get().send(n, n.dedupeKey());
            outbox.markSent(n.id(), used, clock.instant());
        } catch (ChannelException e) {
            outbox.scheduleRetry(n.id(),
                                 backoff.nextAttemptAt(n.attempts(), clock.instant()),
                                 e.failureCode());
            LOG.warnf("notification.send.failed id=%s code=%s attempt=%d",
                      n.id(), e.failureCode(), n.attempts() + 1);
        }
    }
}
