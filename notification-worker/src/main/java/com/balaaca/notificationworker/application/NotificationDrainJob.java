package com.balaaca.notificationworker.application;

import com.balaaca.notificationworker.application.NotificationRouter.UndeliverableException;
import com.balaaca.notificationworker.domain.Backoff;
import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.Alerter;
import com.balaaca.notificationworker.ports.NotificationChannel.ChannelException;
import com.balaaca.notificationworker.ports.NotificationOutbox;
import io.quarkus.scheduler.Scheduled;
import io.quarkus.scheduler.Scheduled.ConcurrentExecution;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
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
    private final NotificationRouter router;
    private final Backoff backoff;
    private final Clock clock;
    private final Alerter alerts;

    public NotificationDrainJob(NotificationOutbox outbox,
                                NotificationRouter router,
                                Clock clock,
                                Alerter alerts) {
        this.outbox = outbox;
        this.router = router;
        this.backoff = new Backoff(RandomGenerator.getDefault());
        this.clock = clock;
        this.alerts = alerts;
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
     * the lease may replay a send that had in fact gone out, and nothing
     * suppresses that: neither the Graph API nor SMTP takes an idempotency key,
     * so the customer reads the message twice. The trade is deliberate - a duplicate
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
            // channel has one. Neither WhatsApp nor SMTP does, so a crash
            // between an acknowledgement and markSent costs a real duplicate.
            // The key still does the job it can: it stops a notification being
            // PLANNED twice, which is the likelier mistake by far.
            //
            // The router answers with the transport the message actually went
            // out on, which is not always the one the customer asked for: a
            // choice with no address behind it falls back to the other, and the
            // row has to record what happened rather than what was wanted.
            Channel used = router.dispatch(n);
            outbox.markSent(n.id(), used, clock.instant());
        } catch (UndeliverableException e) {
            // No transport has an address, so no later attempt can differ.
            // Sixteen tries against nothing would only delay this by an hour.
            outbox.markDead(n.id(), e.failureCode());
            died(n, e.failureCode());
        } catch (ChannelException e) {
            boolean terminal = outbox.scheduleRetry(n.id(),
                                   backoff.nextAttemptAt(n.attempts(), clock.instant()),
                                   e.failureCode());
            if (terminal) {
                died(n, e.failureCode());
            } else {
                LOG.warnf("notification.send.failed id=%s code=%s attempt=%d",
                          n.id(), e.failureCode(), n.attempts() + 1);
            }
        }
    }

    /**
     * A message that will never be sent to somebody who is expecting it.
     *
     * <p>ERROR, not WARN, and said differently: every other failure is a retry
     * that will happen. The outbox doctrine asks for an alert here and there
     * was none - the row simply stopped moving and nothing said so.
     *
     * <p>provider_id and the dedupe key, never the recipient. An operator needs
     * to know whose message died and which one; a phone number in a log line is
     * a phone number in a log aggregator for as long as it is retained, and an
     * alert lands in whatever the operator pointed it at.
     */
    private void died(ClaimedNotification n, String failureCode) {
        LOG.errorf("notification.dead id=%s provider_id=%s kind=%s "
                   + "dedupe_key=%s code=%s attempts=%d",
                   n.id(), n.providerId(), n.kind(), n.dedupeKey(),
                   failureCode, n.attempts() + 1);

        // And now it also reaches somebody. The log line above is what an
        // operator finds when they already know to look; this is what tells
        // them to. Throttled by kind, so a channel outage sends one message
        // saying how many rather than four hundred saying one each, which is
        // how an alert channel gets muted.
        alerts.raise("notification.dead",
                "Un message ne partira jamais : " + n.kind(),
                Map.of("provider_id", String.valueOf(n.providerId()),
                       "kind", String.valueOf(n.kind()),
                       "failure", String.valueOf(failureCode)));
    }
}
