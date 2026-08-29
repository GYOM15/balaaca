package com.balaaca.notificationworker.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.notificationworker.application.NotificationDrainJob;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.NotificationOutbox;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The drain loop against a real PostgreSQL, under the worker's own role.
 *
 * <p>Every claim rule here is a property of the statement rather than of the
 * Java around it - SKIP LOCKED, the partial index's due predicate, the CASE that
 * turns a row DEAD at its cap - so none of them can be proven anywhere but here.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class NotificationDrainIT {

    @Inject
    OutboxFixtures fixtures;

    @Inject
    NotificationOutbox outbox;

    @Inject
    NotificationDrainJob drain;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("Sends what is due and marks it SENT only then")
    void drainsAndMarksSent() {
        UUID id = fixtures.due(OutboxFixtures.SALON, "appointment:1:BOOKING_CONFIRMATION:1");

        drain.drain();

        assertThat(fixtures.status(id)).isEqualTo("SENT");
        assertThat(fixtures.sentAtRecorded(id)).isTrue();
        // The transport the row was addressed by, recorded as the column spells it.
        assertThat(fixtures.channelUsed(id)).isEqualTo("WHATSAPP");
    }

    @Test
    @DisplayName("Drains every provider without binding a tenant")
    void drainsAcrossProviders() {
        UUID mine = fixtures.due(OutboxFixtures.SALON, "appointment:2:BOOKING_CONFIRMATION:1");
        UUID theirs = fixtures.due(OutboxFixtures.OTHER, "appointment:3:BOOKING_CONFIRMATION:1");

        // No app.provider_id is ever set on this connection. The worker's own
        // policy is what admits both rows, which is why it needs no tenant and
        // no BYPASSRLS.
        drain.drain();

        assertThat(fixtures.status(mine)).isEqualTo("SENT");
        assertThat(fixtures.status(theirs)).isEqualTo("SENT");
    }

    @Test
    @DisplayName("Leaves alone what is not due yet")
    void ignoresTheFuture() {
        UUID later = fixtures.scheduledIn(OutboxFixtures.SALON, "appointment:4:REMINDER:1", "1 hour");
        UUID backingOff = fixtures.retryingUntil(OutboxFixtures.SALON, "appointment:5:REMINDER:1", "1 hour");

        drain.drain();

        assertThat(fixtures.status(later)).isEqualTo("PENDING");
        // scheduled_at alone is not the due test: a row still in its backoff is
        // due by the calendar and must not be picked up.
        assertThat(fixtures.status(backingOff)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("Walks past a row another worker holds instead of sending it twice")
    void skipsLockedRows() throws Exception {
        UUID held = fixtures.due(OutboxFixtures.SALON, "appointment:6:BOOKING_CONFIRMATION:1");
        UUID free = fixtures.due(OutboxFixtures.SALON, "appointment:7:BOOKING_CONFIRMATION:1");

        // A second worker mid-claim: the row is locked and uncommitted. Without
        // SKIP LOCKED this claim would block on it and then send it again.
        try (Connection other = fixtures.admin()) {
            other.setAutoCommit(false);
            try (Statement s = other.createStatement()) {
                s.execute("SELECT id FROM notifications WHERE id = '%s' FOR UPDATE".formatted(held));

                List<ClaimedNotification> claimed = outbox.claimDue(50);

                assertThat(claimed).extracting(ClaimedNotification::id).containsExactly(free);
            } finally {
                other.rollback();
            }
        }
    }

    @Test
    @DisplayName("A released lease is picked up again rather than stranded")
    void releasesStaleLeases() {
        UUID abandoned = fixtures.stale(OutboxFixtures.SALON, "appointment:8:REMINDER:1", "10 minutes");
        UUID working = fixtures.stale(OutboxFixtures.SALON, "appointment:9:REMINDER:1", "10 seconds");

        drain.releaseStaleLeases();

        assertThat(fixtures.status(abandoned)).isEqualTo("PENDING");
        // A row claimed seconds ago belongs to a worker that is still sending it.
        assertThat(fixtures.status(working)).isEqualTo("SENDING");
    }
}
