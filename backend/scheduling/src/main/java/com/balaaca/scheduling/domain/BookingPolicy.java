package com.balaaca.scheduling.domain;

import java.time.Duration;

/**
 * How far ahead and how finely a provider accepts bookings.
 *
 * @param slotGranularity the grid candidate starts sit on, so a provider offers
 *                        10:00 and 10:15 rather than every instant
 * @param minLeadTime     how soon is too soon; a booking for two minutes from
 *                        now is a booking the provider will not see in time
 * @param maxAdvanceDays  how far out the calendar is open at all
 */
public record BookingPolicy(Duration slotGranularity, Duration minLeadTime, int maxAdvanceDays) {

    public static final BookingPolicy DEFAULT =
            new BookingPolicy(Duration.ofMinutes(15), Duration.ofMinutes(60), 60);

    public BookingPolicy {
        if (slotGranularity.isZero() || slotGranularity.isNegative()) {
            throw new IllegalArgumentException("slotGranularity must be positive");
        }
        if (minLeadTime.isNegative()) {
            throw new IllegalArgumentException("minLeadTime must not be negative");
        }
        if (maxAdvanceDays < 1) {
            throw new IllegalArgumentException("maxAdvanceDays must be at least 1");
        }
    }
}
