package com.balaaca.notificationworker.adapters.outbound.alert;

import com.balaaca.notificationworker.ports.Alerter;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * One alert per kind per window, carrying how many it stands for.
 *
 * <p>This is the whole difficulty of alerting and the reason it is not simply a
 * POST at the point of failure. A channel outage does not produce one dead
 * notification, it produces every notification: four hundred messages arrive,
 * the operator mutes the channel, and from then on the system has no alerting
 * at all - which is strictly worse than having none, because everyone believes
 * it has some.
 *
 * <p>So the first of a kind goes out immediately, and the rest are counted. The
 * next one after the window says "and 397 more since", which is the sentence
 * that actually tells an operator this is an outage and not an accident.
 *
 * <p>In memory, and that is deliberate rather than lazy. The worker is one
 * process; a restart clearing the counters means the first failure after a
 * restart alerts, which is exactly what should happen. Persisting it would make
 * a crashed worker silent about the crash it just recovered from.
 */
@ApplicationScoped
public class ThrottledAlerter implements Alerter {

    private static final Logger LOG = Logger.getLogger(ThrottledAlerter.class);

    private final Instance<AlertChannel> channel;
    private final Clock clock;
    private final Duration window;

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public ThrottledAlerter(Instance<AlertChannel> channel, Clock clock,
                            @ConfigProperty(name = "balaaca.alerts.window-minutes",
                                            defaultValue = "15") int windowMinutes) {
        this.channel = channel;
        this.clock = clock;
        this.window = Duration.ofMinutes(windowMinutes);
    }

    @Override
    public void raise(String kind, String summary, Map<String, String> details) {
        Instant now = clock.instant();
        Window state = windows.computeIfAbsent(kind, k -> new Window(now));

        int suppressed = state.recordAndCountSuppressed(now, window);
        if (suppressed < 0) {
            return;
        }

        String message = suppressed == 0
                ? summary
                : summary + " (et " + suppressed + " autres depuis)";

        try {
            channel.get().send(kind, message, details);
        } catch (RuntimeException e) {
            // An alerter that throws takes the drain loop down with it, which
            // turns a channel outage into a total outage. The log line is the
            // fallback, and it is the one place a failure to alert can be seen.
            LOG.errorf(e, "alert.undeliverable kind=%s", kind);
        }
    }

    /** The state of one kind: when it last went out, and how many since. */
    private static final class Window {
        private volatile Instant lastSent;
        private final AtomicInteger sinceLast = new AtomicInteger();

        Window(Instant now) {
            // Epoch, so the very first call is always outside the window and
            // goes out immediately rather than being swallowed as a duplicate.
            this.lastSent = Instant.EPOCH;
        }

        /** @return how many were suppressed, or -1 when this one is suppressed too */
        int recordAndCountSuppressed(Instant now, Duration window) {
            synchronized (this) {
                if (now.isBefore(lastSent.plus(window))) {
                    sinceLast.incrementAndGet();
                    return -1;
                }
                lastSent = now;
                return sinceLast.getAndSet(0);
            }
        }
    }
}
