package com.balaaca.scheduling.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Objects;

/**
 * Opening hours as the provider states them: local wall-clock time, meaningless
 * until paired with a date and a zone.
 *
 * <p>{@code end} before {@code start} means the window wraps past midnight. A
 * barber open 22:00 to 01:00 is an ordinary case, and a CHECK forbidding it
 * would make that provider unrepresentable.
 */
public record LocalWindow(LocalTime start, LocalTime end) {

    public LocalWindow {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        if (start.equals(end)) {
            // Not a wrap and not a window: ambiguous between zero and 24 hours.
            throw new IllegalArgumentException("start and end must differ: " + start);
        }
    }

    public boolean spansMidnight() {
        return end.isBefore(start);
    }

    /**
     * Materialises this window on a local date, in the provider's zone.
     *
     * <p>Conversion happens here and nowhere else. {@code ZonedDateTime.of}
     * shifts a local time inside a spring-forward gap FORWARD BY THE LENGTH OF
     * THE GAP - 02:30 becomes 03:30 in Europe/Paris - and picks the earlier
     * offset in an autumn overlap. That is the behaviour, stated rather than
     * assumed, because the launch market is UTC+0 with no DST and would hide any
     * mistake here until the first provider elsewhere.
     */
    public InstantRange on(LocalDate date, ZoneId zone) {
        ZonedDateTime from = ZonedDateTime.of(date, start, zone);
        LocalDate endDate = spansMidnight() ? date.plusDays(1) : date;
        ZonedDateTime until = ZonedDateTime.of(endDate, end, zone);
        return new InstantRange(from.toInstant(), until.toInstant());
    }
}
