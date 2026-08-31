package com.balaaca.scheduling.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Turns a provider's declared hours into the slots a customer can take.
 *
 * <p>A pure function on a value: no repository, no clock, no container. That is
 * what makes closed days, lunch breaks, midnight-spanning hours and daylight
 * saving plain unit tests instead of integration tests nobody writes.
 *
 * <p>What it produces must agree with what the database will accept. A slot
 * offered here and then rejected by the exclusion constraint is a 409 on
 * something the API just advertised as free, which is worse than not offering
 * it: the customer watches a slot vanish as they tap it.
 */
public final class SlotCalculator {

    private SlotCalculator() {
    }

    public static List<AvailableSlot> bookable(SlotQuery query) {
        List<AvailableSlot> slots = new ArrayList<>();
        Instant earliest = query.now().plus(query.policy().minLeadTime());
        Instant latest = query.now().plus(Duration.ofDays(query.policy().maxAdvanceDays()));

        // Computed once over the whole query rather than per date, so an
        // absence declared on Friday still bites a Thursday window that runs
        // past midnight into it.
        List<InstantRange> unavailable = new ArrayList<>(query.busy());
        unavailable.addAll(timeOff(query));

        for (LocalDate date = query.fromDate();
             !date.isAfter(query.toDate());
             date = date.plusDays(1)) {

            for (LocalWindow window : windowsOn(date, query)) {
                slots.addAll(slotsIn(window.on(date, query.zone()), query,
                                     earliest, latest, unavailable));
            }
        }

        // Distinct by start, in order. Two windows may legitimately overlap -
        // two weekly rules on one day, or two CUSTOM_HOURS entries on one date -
        // and without this the same ten o'clock is emitted twice into a
        // paginated list, where it reads as two chairs rather than one time.
        return slots.stream()
                .collect(Collectors.toMap(AvailableSlot::startsAt, s -> s, (a, b) -> a,
                                          TreeMap::new))
                .values().stream()
                .toList();
    }

    /**
     * The windows open on a date, from the entries that ADD time.
     *
     * <p>Every entry on the date is read, not the first one found. A date may
     * carry several, and taking one arbitrarily meant a provider could declare a
     * morning window and an afternoon window, be answered 201 twice, and have
     * one of the two silently discarded.
     *
     * <p>CLOSED wins over everything: a provider who declares a holiday means
     * closed, not "closed except for the usual hours". CUSTOM_HOURS entries
     * replace the weekly rules and union with each other. TIME_OFF is absent
     * from this method on purpose - it subtracts, so a date carrying only a
     * TIME_OFF entry keeps its ordinary week.
     */
    private static List<LocalWindow> windowsOn(LocalDate date, SlotQuery query) {
        List<AvailabilityOverride> onDate = query.overrides().stream()
                .filter(o -> o.date().equals(date))
                .toList();

        if (onDate.stream().anyMatch(o -> o.kind() == AvailabilityOverride.Kind.CLOSED)) {
            return List.of();
        }

        List<LocalWindow> custom = onDate.stream()
                .filter(o -> o.kind() == AvailabilityOverride.Kind.CUSTOM_HOURS)
                .flatMap(o -> o.window().stream())
                .toList();
        if (!custom.isEmpty()) {
            return custom;
        }

        return query.rules().stream()
                .filter(rule -> rule.appliesOn(date))
                .map(AvailabilityRule::window)
                .toList();
    }

    /**
     * The declared absences, as instants.
     *
     * <p>They join the busy ranges rather than carving the open windows up,
     * because the test a candidate must pass is the same one: does this widened
     * slot overlap something that is not free? An absence and an appointment
     * occupy the person identically - what differs is only who wrote the row.
     *
     * <p>They are NOT busy ranges in the database's sense, though, and that
     * distinction matters where the two paths diverge: whether a slot is TAKEN
     * is the exclusion constraint's answer and is deliberately not asked when
     * validating one start, while whether the provider is THERE is part of what
     * they declared and must be asked every time.
     */
    private static List<InstantRange> timeOff(SlotQuery query) {
        return query.overrides().stream()
                .filter(o -> o.kind() == AvailabilityOverride.Kind.TIME_OFF)
                .flatMap(o -> o.window().stream()
                        .map(w -> w.on(o.date(), query.zone())))
                .toList();
    }

    private static List<AvailableSlot> slotsIn(InstantRange open, SlotQuery query,
                                               Instant earliest, Instant latest,
                                               List<InstantRange> unavailable) {
        List<AvailableSlot> slots = new ArrayList<>();

        for (Instant start = open.from();
             !start.plus(query.serviceDuration()).isAfter(open.until());
             start = start.plus(query.policy().slotGranularity())) {

            Instant end = start.plus(query.serviceDuration());

            // Too soon for the provider to react, or beyond the open horizon.
            if (start.isBefore(earliest) || start.isAfter(latest)) {
                continue;
            }
            // The candidate is widened by the REQUESTED service's buffers; the
            // busy ranges already carry their own. Widening both sides would
            // double-count and hide slots that are genuinely free.
            InstantRange blocked = new InstantRange(
                    start.minus(query.bufferBefore()),
                    end.plus(query.bufferAfter()));

            if (unavailable.stream().noneMatch(blocked::overlaps)) {
                slots.add(new AvailableSlot(start, end));
            }
        }
        return slots;
    }

    /**
     * Whether one requested start is bookable, answered by the same rules that
     * produced the list.
     *
     * <p>Shared deliberately: a separate check would drift from the calculator,
     * and the two disagreeing is exactly how an API ends up rejecting a slot it
     * had just offered.
     */
    public static boolean isBookable(Instant startsAt, SlotQuery query) {
        return bookable(query).stream().anyMatch(slot -> slot.startsAt().equals(startsAt));
    }
}
