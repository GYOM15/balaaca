package com.balaaca.notificationworker.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.random.RandomGenerator;

/**
 * When to try again. Exponential, capped, and jittered.
 *
 * <p>The jitter is not decoration. A gateway outage fails every pending row at
 * once; without it they all come back at the same instant, and the retry storm
 * is a second outage of the worker's own making.
 */
public final class Backoff {

    private static final Duration BASE = Duration.ofSeconds(30);

    /** Beyond this the delay stops doubling: 30s << 6 is already sixteen minutes. */
    private static final int MAX_SHIFT = 6;

    private final RandomGenerator random;

    public Backoff(RandomGenerator random) {
        this.random = random;
    }

    public Instant nextAttemptAt(int attempts, Instant now) {
        long seconds = BASE.toSeconds() << Math.min(Math.max(attempts, 0), MAX_SHIFT);
        long jitter = random.nextLong(seconds / 4 + 1);
        return now.plusSeconds(seconds + jitter);
    }
}
