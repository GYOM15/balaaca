package com.balaaca.notificationworker.application;

import com.balaaca.notificationworker.domain.Backoff;
import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.Alerter;
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
    private final Alerter alerts;

    public NotificationDrainJob(NotificationOutbox outbox,
                                Instance<NotificationChannel> channel,
                                Clock clock,
                                Alerter alerts) {
        this.outbox = outbox;
        this.channel = channel;
        this.backoff = new Backoff(RandomGenerator.getDefault());
        this.clock = clock;
        this.alerts = alerts;
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
     * A row left SENDING is a row nothing will ever pick up again. Releasing
     * the lease may replay a send that had in fact gone out, and on WhatsApp
     * nothing suppresses that: the API takes no idempotency key, so the
     * customer reads the message twice. The trade is deliberate - a duplicate
     * confirmation is an annoyance, a confirmation that never arrives is a
     * customer standing outside a closed salon.
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
            // The dedupe key travels as the channel's idempotency key where a
            // channel has one. WhatsApp does not, so a crash between its
            // acknowledgement and markSent costs a real duplicate. The key still
            // does the job it can: it stops a notification being PLANNED twice,
            // which is the likelier mistake by far.
            Channel used = channel.get().send(n, n.dedupeKey());
            outbox.markSent(n.id(), used, clock.instant());
        } catch (ChannelException e) {
            boolean died = outbox.scheduleRetry(n.id(),
                                 backoff.nextAttemptAt(n.attempts(), clock.instant()),
                                 e.failureCode());
            if (died) {
                // ERROR, not WARN, and said differently: every other failure is
                // a retry that will happen, and this one is a message that will
                // never be sent to a customer who is expecting it. The outbox
                // doctrine asks for an alert here and there was none - the row
                // simply stopped moving and nothing said so.
                //
                // provider_id and the dedupe key, never the recipient: an
                // operator needs to know whose message died and which one, and
                // a phone number in a log line is a phone number in a log
                // aggregator for as long as it is retained.
                LOG.errorf("notification.dead id=%s provider_id=%s kind=%s "
                           + "dedupe_key=%s code=%s attempts=%d",
                           n.id(), n.providerId(), n.kind(), n.dedupeKey(),
                           e.failureCode(), n.attempts() + 1);

                // And now it also reaches somebody. The log line above is what
                // an operator finds when they already know to look; this is
                // what tells them to. Throttled by kind, so a channel outage
                // sends one message saying how many rather than four hundred
                // saying one each - which is how an alert channel gets muted.
                //
                // No recipient in the details, ever: an alert lands in whatever
                // the operator pointed it at, and a customer's telephone number
                // does not belong there.
                alerts.raise("notification.dead",
                        "Un message ne partira jamais : " + n.kind(),
                        java.util.Map.of("provider_id", String.valueOf(n.providerId()),
                                         "kind", String.valueOf(n.kind()),
                                         "failure", String.valueOf(e.failureCode())));
            } else {
                LOG.warnf("notification.send.failed id=%s code=%s attempt=%d",
                          n.id(), e.failureCode(), n.attempts() + 1);
            }
        }
    }
}
