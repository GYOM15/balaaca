package com.balaaca.notificationworker.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.notificationworker.application.NotificationDrainJob;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a dead gateway does to a row.
 *
 * <p>Split from {@link NotificationDrainIT} because it needs a channel that
 * always fails, and a test that can only fail is the wrong place to assert what
 * success looks like.
 */
@QuarkusTest
@TestProfile(FailingChannelProfile.class)
@QuarkusTestResource(PostgresTestResource.class)
class NotificationRetryIT {

    @Inject
    OutboxFixtures fixtures;

    @Inject
    NotificationDrainJob drain;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("A failed send comes back PENDING, counted and pushed out")
    void failureSchedulesARetry() {
        UUID id = fixtures.due(OutboxFixtures.SALON, "appointment:10:BOOKING_CONFIRMATION:1");

        drain.drain();

        assertThat(fixtures.status(id)).isEqualTo("PENDING");
        assertThat(fixtures.attempts(id)).isEqualTo(1);
        // Pushed out, so the next drain a few seconds later does not hammer a
        // gateway that has just said no.
        assertThat(fixtures.retryPushedIntoTheFuture(id)).isTrue();
    }

    @Test
    @DisplayName("last_error holds the adapter's code, never a provider payload")
    void failureRecordsAStableCode() {
        UUID id = fixtures.due(OutboxFixtures.SALON, "appointment:11:BOOKING_CONFIRMATION:1");

        drain.drain();

        assertThat(fixtures.lastError(id)).isEqualTo(FailingNotificationChannel.CODE);
    }

    @Test
    @DisplayName("At its cap the row is DEAD, not retried for ever")
    void theCapIsTerminal() {
        UUID id = fixtures.lastAttempt(OutboxFixtures.SALON, "appointment:12:BOOKING_CONFIRMATION:1");

        drain.drain();

        assertThat(fixtures.status(id)).isEqualTo("DEAD");
        // And a DEAD row is not due to anything: the next drain must not see it.
        drain.drain();
        assertThat(fixtures.attempts(id)).isEqualTo(6);
    }
}
