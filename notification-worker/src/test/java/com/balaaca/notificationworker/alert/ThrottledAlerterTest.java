package com.balaaca.notificationworker.alert;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.notificationworker.adapters.outbound.alert.AlertChannel;
import com.balaaca.notificationworker.adapters.outbound.alert.ThrottledAlerter;
import jakarta.enterprise.inject.Instance;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The whole difficulty of alerting, and the reason it is not simply a POST at
 * the point of failure.
 *
 * <p>A channel outage does not produce one dead notification, it produces every
 * notification. Four hundred messages arrive, the operator mutes the channel,
 * and from then on the system has no alerting at all - which is strictly worse
 * than having none, because everyone believes it has some.
 */
class ThrottledAlerterTest {

    /** Records what would have gone out, so the test reads the destination. */
    private static final class Recorder implements AlertChannel {
        final List<String> sent = new ArrayList<>();

        @Override
        public void send(String kind, String message, Map<String, String> details) {
            sent.add(message);
        }
    }

    /** Moves on demand; a real clock would make this test about timing. */
    private static final class Hand extends Clock {
        private Instant now = Instant.parse("2026-09-07T10:00:00Z");

        void advance(Duration by) {
            now = now.plus(by);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }

    private static Instance<AlertChannel> only(AlertChannel channel) {
        return new Instance<>() {
            @Override public AlertChannel get() { return channel; }
            @Override public Instance<AlertChannel> select(java.lang.annotation.Annotation... q) {
                return this;
            }
            @Override public <U extends AlertChannel> Instance<U> select(
                    Class<U> type, java.lang.annotation.Annotation... q) {
                throw new UnsupportedOperationException();
            }
            @Override public <U extends AlertChannel> Instance<U> select(
                    jakarta.enterprise.util.TypeLiteral<U> type,
                    java.lang.annotation.Annotation... q) {
                throw new UnsupportedOperationException();
            }
            @Override public boolean isUnsatisfied() { return false; }
            @Override public boolean isAmbiguous() { return false; }
            @Override public void destroy(AlertChannel instance) { }
            @Override public Iterator<AlertChannel> iterator() {
                return List.of(channel).iterator();
            }
            @Override public jakarta.enterprise.inject.Instance.Handle<AlertChannel> getHandle() {
                throw new UnsupportedOperationException();
            }
            @Override public Iterable<? extends jakarta.enterprise.inject.Instance.Handle<
                    AlertChannel>> handles() {
                throw new UnsupportedOperationException();
            }
        };
    }

    @Test
    @DisplayName("The first goes out at once, because a first failure is news")
    void theFirstIsNotDelayed() {
        Recorder channel = new Recorder();
        new ThrottledAlerter(only(channel), new Hand(), 15)
                .raise("notification.dead", "Un message ne partira jamais", Map.of());

        assertThat(channel.sent).containsExactly("Un message ne partira jamais");
    }

    @Test
    @DisplayName("An outage sends one message saying how many, not four hundred saying one")
    void itCountsRatherThanRepeats() {
        Recorder channel = new Recorder();
        Hand clock = new Hand();
        ThrottledAlerter alerter = new ThrottledAlerter(only(channel), clock, 15);

        alerter.raise("notification.dead", "Un message ne partira jamais", Map.of());
        for (int i = 0; i < 399; i++) {
            alerter.raise("notification.dead", "Un message ne partira jamais", Map.of());
        }

        // Still one. Four hundred is how an alert channel gets muted, after
        // which nothing is alerting at all.
        assertThat(channel.sent).hasSize(1);

        clock.advance(Duration.ofMinutes(16));
        alerter.raise("notification.dead", "Un message ne partira jamais", Map.of());

        // And the next one carries the count, which is the sentence that tells
        // an operator this is an outage and not an accident.
        assertThat(channel.sent).hasSize(2);
        assertThat(channel.sent.get(1)).contains("399 autres");
    }

    @Test
    @DisplayName("One kind being noisy does not silence another")
    void theBudgetIsPerKind() {
        Recorder channel = new Recorder();
        ThrottledAlerter alerter = new ThrottledAlerter(only(channel), new Hand(), 15);

        alerter.raise("notification.dead", "premier type", Map.of());
        alerter.raise("notification.dead", "premier type", Map.of());
        alerter.raise("drain.failed", "deuxieme type", Map.of());

        assertThat(channel.sent).containsExactly("premier type", "deuxieme type");
    }

    @Test
    @DisplayName("A destination that throws does not take the drain loop with it")
    void anUnreachableChannelIsNotAnOutage() {
        AlertChannel broken = (kind, message, details) -> {
            throw new IllegalStateException("unreachable");
        };

        // A channel outage turning into a total outage is the failure mode this
        // guards: alerting is the least important thing the worker does.
        new ThrottledAlerter(only(broken), new Hand(), 15)
                .raise("notification.dead", "peu importe", Map.of());
    }
}
