package com.balaaca.scheduling.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

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

        for (LocalDate date = query.fromDate();
             !date.isAfter(query.toDate());
             date = date.plusDays(1)) {

            for (LocalWindow window : windowsOn(date, query)) {
                slots.addAll(slotsIn(window.on(date, query.zone()), query, earliest, latest));
            }
        }
        return List.copyOf(slots);
    }

    /**
     * The windows open on a date. An override replaces the weekly rules for that
     * date rather than adding to them: a provider who declares a closure means
     * closed, not "closed except for the usual hours".
     */
    private static List<LocalWindow> windowsOn(LocalDate date, SlotQuery query) {
        Optional<AvailabilityOverride> override = query.overrides().stream()
                .filter(o -> o.date().equals(date))
                .findFirst();

        if (override.isPresent()) {
            return override.get().kind() == AvailabilityOverride.Kind.CLOSED
                    ? List.of()
                    : override.get().window().map(List::of).orElseGet(List::of);
        }
        return query.rules().stream()
                .filter(rule -> rule.appliesOn(date))
                .map(AvailabilityRule::window)
                .toList();
    }

    private static List<AvailableSlot> slotsIn(InstantRange open, SlotQuery query,
                                               Instant earliest, Instant latest) {
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

            if (query.busy().stream().noneMatch(blocked::overlaps)) {
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
