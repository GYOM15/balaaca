package com.balaaca.scheduling.domain;

import java.time.Instant;
import java.util.Objects;

/**
 * A half-open interval on the timeline, matching the database's tstzrange with
 * '[)' bounds. Half-open is what makes 10:00-11:00 and 11:00-12:00 adjacent
 * rather than overlapping.
 */
public record InstantRange(Instant from, Instant until) {

    public InstantRange {
        Objects.requireNonNull(from, "from");
        Objects.requireNonNull(until, "until");
        if (!until.isAfter(from)) {
            // An empty range overlaps nothing, which would silently make every
            // conflict check pass. It is never a valid value here.
            throw new IllegalArgumentException("until must be after from: " + from + " to " + until);
        }
    }

    public boolean overlaps(InstantRange other) {
        return from.isBefore(other.until) && other.from.isBefore(until);
    }

    public boolean contains(InstantRange other) {
        return !other.from.isBefore(from) && !other.until.isAfter(until);
    }
}
