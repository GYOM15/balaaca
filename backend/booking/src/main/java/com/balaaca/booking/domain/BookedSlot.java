package com.balaaca.booking.domain;

import java.time.Duration;
import java.time.Instant;

/**
 * The window a booking occupies, computed from the offering's own duration and
 * buffers rather than from anything the client sent. A client supplies a start;
 * everything else follows, so a client cannot shrink what it blocks.
 *
 * <p>{@code blockedFrom}/{@code blockedUntil} must match what the database
 * derives in ck_appointments_block_derived, or the insert is rejected. That
 * constraint is what makes the blocked range a fact rather than a claim.
 *
 * <p>The factory takes durations, not another context's offering type: this is
 * booking's domain, and it should not need to know that catalog exists in order
 * to add two intervals to an instant.
 */
public record BookedSlot(Instant startsAt, Instant endsAt,
                         Instant blockedFrom, Instant blockedUntil,
                         int bufferBeforeMinutes, int bufferAfterMinutes) {

    public static BookedSlot from(Instant startsAt, Duration duration,
                                  Duration bufferBefore, Duration bufferAfter) {
        if (duration.isZero() || duration.isNegative()) {
            // A zero-length booking produces an EMPTY range, and an empty range
            // overlaps nothing - which would silently disable the constraint
            // that stops double booking.
            throw new IllegalArgumentException("duration must be positive, was " + duration);
        }
        Instant endsAt = startsAt.plus(duration);
        return new BookedSlot(
                startsAt,
                endsAt,
                startsAt.minus(bufferBefore),
                endsAt.plus(bufferAfter),
                (int) bufferBefore.toMinutes(),
                (int) bufferAfter.toMinutes());
    }
}
