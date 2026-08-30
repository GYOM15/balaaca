package com.balaaca.scheduling.domain;

import java.time.LocalDate;
import java.util.Optional;

/**
 * A single date that departs from the weekly pattern: a holiday, a closure, or
 * exceptional hours. An override replaces the day's rules entirely rather than
 * adding to them - a provider who says "closed" means closed.
 */
public record AvailabilityOverride(LocalDate date, Kind kind, Optional<LocalWindow> window) {

    public enum Kind { CLOSED, CUSTOM_HOURS }

    public static AvailabilityOverride closed(LocalDate date) {
        return new AvailabilityOverride(date, Kind.CLOSED, Optional.empty());
    }

    public static AvailabilityOverride customHours(LocalDate date, LocalWindow window) {
        return new AvailabilityOverride(date, Kind.CUSTOM_HOURS, Optional.of(window));
    }
}
