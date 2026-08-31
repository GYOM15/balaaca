package com.balaaca.scheduling.domain;

import java.time.LocalDate;
import java.util.Optional;

/**
 * A single date that departs from the weekly pattern.
 *
 * <p>A date may carry several of these and they compose in one order, stated
 * once here and implemented once in {@link SlotCalculator}: a {@link
 * Kind#CLOSED} entry anywhere on the date takes the whole day; otherwise the
 * {@link Kind#CUSTOM_HOURS} windows replace the day's weekly rules; and the
 * {@link Kind#TIME_OFF} windows are then taken out of whatever is left.
 *
 * <p>TIME_OFF is the only one that subtracts, and it exists because the other
 * two could not say "I am away on Thursday from two to three". Closing Thursday
 * says too much, and restating Thursday as two custom windows makes the provider
 * do the arithmetic - and then only one of those two rows was read.
 */
public record AvailabilityOverride(LocalDate date, Kind kind, Optional<LocalWindow> window) {

    public enum Kind {
        /** The day is gone, whatever else the date carries. */
        CLOSED,
        /** These hours instead of the weekly ones. */
        CUSTOM_HOURS,
        /** The weekly hours, minus this window. */
        TIME_OFF
    }

    public AvailabilityOverride {
        if ((kind == Kind.CLOSED) == window.isPresent()) {
            // Mirrors ck_availability_overrides_shape. A closed day with a
            // window, or an absence without one, is not a value we can act on:
            // the calculator would have to guess which half to believe.
            throw new IllegalArgumentException(
                    "CLOSED carries no window; CUSTOM_HOURS and TIME_OFF require one");
        }
    }

    public static AvailabilityOverride closed(LocalDate date) {
        return new AvailabilityOverride(date, Kind.CLOSED, Optional.empty());
    }

    public static AvailabilityOverride customHours(LocalDate date, LocalWindow window) {
        return new AvailabilityOverride(date, Kind.CUSTOM_HOURS, Optional.of(window));
    }

    public static AvailabilityOverride timeOff(LocalDate date, LocalWindow window) {
        return new AvailabilityOverride(date, Kind.TIME_OFF, Optional.of(window));
    }
}
