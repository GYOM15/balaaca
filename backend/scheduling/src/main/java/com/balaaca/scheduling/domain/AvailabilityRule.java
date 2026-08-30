package com.balaaca.scheduling.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Optional;

/**
 * A recurring opening segment. Breaks are the gaps between segments on the same
 * day rather than rows of their own: two segments 09:00-13:00 and 14:00-18:00
 * describe a lunch break without a second concept.
 */
public record AvailabilityRule(
        DayOfWeek day,
        LocalWindow window,
        Optional<LocalDate> effectiveFrom,
        Optional<LocalDate> effectiveTo) {

    public static AvailabilityRule of(DayOfWeek day, LocalWindow window) {
        return new AvailabilityRule(day, window, Optional.empty(), Optional.empty());
    }

    public boolean appliesOn(LocalDate date) {
        return date.getDayOfWeek() == day
                && effectiveFrom.map(f -> !date.isBefore(f)).orElse(true)
                && effectiveTo.map(t -> !date.isAfter(t)).orElse(true);
    }
}
