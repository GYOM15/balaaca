package com.balaaca.scheduling.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/**
 * Everything the calculator needs, and nothing it could fetch itself. Keeping it
 * a value makes the calculation a pure function: no repository, no clock, no
 * container, so every edge case is a plain unit test.
 *
 * @param busy         the STORED blocked range of each active appointment,
 *                     already inclusive of that appointment's own frozen
 *                     buffers. The calculator never widens these again -
 *                     widening them by the requested service's buffers would
 *                     double-count and start hiding free slots
 * @param bufferBefore the REQUESTED service's buffers, applied to the candidate
 * @param now          injected, never read from the system clock
 */
public record SlotQuery(
        LocalDate fromDate,
        LocalDate toDate,
        ZoneId zone,
        List<AvailabilityRule> rules,
        List<AvailabilityOverride> overrides,
        List<InstantRange> busy,
        Duration serviceDuration,
        Duration bufferBefore,
        Duration bufferAfter,
        BookingPolicy policy,
        Instant now) {

    public SlotQuery {
        if (toDate.isBefore(fromDate)) {
            throw new IllegalArgumentException("toDate must not precede fromDate");
        }
        if (serviceDuration.isZero() || serviceDuration.isNegative()) {
            throw new IllegalArgumentException("serviceDuration must be positive");
        }
        rules = List.copyOf(rules);
        overrides = List.copyOf(overrides);
        busy = List.copyOf(busy);
    }
}
