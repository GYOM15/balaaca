package com.balaaca.scheduling.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * The slot calculator, exercised as a pure function.
 *
 * <p>Guinea is UTC+0 with no daylight saving, which hides an entire class of
 * timezone bugs: code that is wrong everywhere else passes every test written
 * against the launch market. Several of these therefore run under Europe/Paris,
 * where the offset moves twice a year.
 */
class SlotCalculatorTest {

    private static final ZoneId CONAKRY = ZoneId.of("Africa/Conakry");
    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    /** A Monday, comfortably ahead of any lead time used below. */
    private static final LocalDate MONDAY = LocalDate.of(2026, 9, 7);
    private static final Instant NOW = Instant.parse("2026-09-01T08:00:00Z");

    private static LocalWindow window(String start, String end) {
        return new LocalWindow(LocalTime.parse(start), LocalTime.parse(end));
    }

    private static Builder aQuery() {
        return new Builder();
    }

    @Nested
    @DisplayName("Weekly hours")
    class WeeklyHours {

        @Test
        @DisplayName("Offers slots on the grid inside the declared window")
        void offersSlotsOnTheGrid() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .service(Duration.ofMinutes(60))
                    .build());

            // 09:00 through 11:00 start; 11:15 would end at 12:15, past closing.
            assertThat(slots).hasSize(9);
            assertThat(slots.get(0).startsAt()).isEqualTo(Instant.parse("2026-09-07T09:00:00Z"));
            assertThat(slots.get(slots.size() - 1).startsAt())
                    .isEqualTo(Instant.parse("2026-09-07T11:00:00Z"));
        }

        @Test
        @DisplayName("Offers nothing on a day with no rule")
        void closedDayOffersNothing() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.TUESDAY, window("09:00", "18:00"))
                    .build());

            assertThat(slots).isEmpty();
        }

        @Test
        @DisplayName("Treats the gap between two segments as a lunch break")
        void lunchBreakIsTheGapBetweenSegments() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .rule(DayOfWeek.MONDAY, window("14:00", "17:00"))
                    .service(Duration.ofMinutes(60))
                    .build());

            assertThat(slots).extracting(AvailableSlot::startsAt)
                    .doesNotContain(Instant.parse("2026-09-07T12:00:00Z"),
                                    Instant.parse("2026-09-07T13:00:00Z"))
                    .contains(Instant.parse("2026-09-07T14:00:00Z"));
        }

        @Test
        @DisplayName("Offers nothing when the service is longer than the window")
        void serviceLongerThanWindow() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "10:00"))
                    .service(Duration.ofMinutes(90))
                    .build());

            assertThat(slots).isEmpty();
        }

        @Test
        @DisplayName("Honours a rule's effective period")
        void ruleOutsideItsEffectivePeriod() {
            SlotQuery query = aQuery()
                    .on(MONDAY)
                    .rawRule(new AvailabilityRule(DayOfWeek.MONDAY, window("09:00", "18:00"),
                            Optional.of(MONDAY.plusDays(7)), Optional.empty()))
                    .build();

            assertThat(SlotCalculator.bookable(query)).isEmpty();
        }
    }

    @Nested
    @DisplayName("Overrides replace the day")
    class Overrides {

        @Test
        @DisplayName("A closure wins over the weekly rule")
        void closureWins() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "18:00"))
                    .override(AvailabilityOverride.closed(MONDAY))
                    .build());

            assertThat(slots).isEmpty();
        }

        @Test
        @DisplayName("Exceptional hours replace the usual ones rather than adding to them")
        void customHoursReplace() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "18:00"))
                    .override(AvailabilityOverride.customHours(MONDAY, window("14:00", "16:00")))
                    .service(Duration.ofMinutes(60))
                    .build());

            assertThat(slots).extracting(AvailableSlot::startsAt)
                    .allMatch(s -> !s.isBefore(Instant.parse("2026-09-07T14:00:00Z")))
                    .doesNotContain(Instant.parse("2026-09-07T09:00:00Z"));
        }
    }

    @Nested
    @DisplayName("Existing bookings")
    class Busy {

        @Test
        @DisplayName("Hides a slot whose blocked window overlaps an existing booking")
        void busyRangeHidesSlot() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .service(Duration.ofMinutes(60))
                    .busy(new InstantRange(Instant.parse("2026-09-07T10:00:00Z"),
                                           Instant.parse("2026-09-07T11:00:00Z")))
                    .build());

            assertThat(slots).extracting(AvailableSlot::startsAt)
                    .contains(Instant.parse("2026-09-07T09:00:00Z"))
                    .doesNotContain(Instant.parse("2026-09-07T10:00:00Z"),
                                    Instant.parse("2026-09-07T10:30:00Z"));
        }

        @Test
        @DisplayName("Widens only the candidate, never the existing booking")
        void widensOnlyTheCandidate() {
            // The stored range already carries its own buffers. Widening it again
            // by the requested service's buffers would hide 09:00, which is free.
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .service(Duration.ofMinutes(60))
                    .buffers(Duration.ZERO, Duration.ZERO)
                    .busy(new InstantRange(Instant.parse("2026-09-07T10:00:00Z"),
                                           Instant.parse("2026-09-07T11:00:00Z")))
                    .build());

            assertThat(slots).extracting(AvailableSlot::startsAt)
                    .contains(Instant.parse("2026-09-07T09:00:00Z"));
        }

        @Test
        @DisplayName("A lead-in buffer pushes the first free slot later")
        void leadInBufferHidesTheAdjacentSlot() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "14:00"))
                    .service(Duration.ofMinutes(60))
                    .buffers(Duration.ofMinutes(15), Duration.ZERO)
                    .busy(new InstantRange(Instant.parse("2026-09-07T10:00:00Z"),
                                           Instant.parse("2026-09-07T11:00:00Z")))
                    .build());

            // 11:00 would need to block from 10:45, inside the existing booking.
            assertThat(slots).extracting(AvailableSlot::startsAt)
                    .doesNotContain(Instant.parse("2026-09-07T11:00:00Z"))
                    .contains(Instant.parse("2026-09-07T11:15:00Z"));
        }
    }

    @Nested
    @DisplayName("Policy bounds")
    class Policy {

        @Test
        @DisplayName("Refuses a slot sooner than the minimum lead time")
        void minimumLeadTime() {
            Instant now = Instant.parse("2026-09-07T08:30:00Z");
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .service(Duration.ofMinutes(60))
                    .now(now)
                    .policy(new BookingPolicy(Duration.ofMinutes(15), Duration.ofMinutes(60), 60))
                    .build());

            // 09:00 is only thirty minutes away; the first bookable start is 09:30.
            assertThat(slots).extracting(AvailableSlot::startsAt)
                    .doesNotContain(Instant.parse("2026-09-07T09:00:00Z"))
                    .contains(Instant.parse("2026-09-07T09:30:00Z"));
        }

        @Test
        @DisplayName("Refuses a slot beyond the booking horizon")
        void maximumHorizon() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .now(Instant.parse("2026-08-01T08:00:00Z"))
                    .policy(new BookingPolicy(Duration.ofMinutes(15), Duration.ofMinutes(60), 7))
                    .build());

            assertThat(slots).isEmpty();
        }
    }

    @Nested
    @DisplayName("Time is not as simple as the launch market makes it look")
    class Temporal {

        @Test
        @DisplayName("A window spanning midnight runs into the next local day")
        void spansMidnight() {
            List<AvailableSlot> slots = SlotCalculator.bookable(aQuery()
                    .on(MONDAY)
                    .rule(DayOfWeek.MONDAY, window("22:00", "01:00"))
                    .service(Duration.ofMinutes(60))
                    .build());

            assertThat(slots).isNotEmpty();
            assertThat(slots.get(0).startsAt()).isEqualTo(Instant.parse("2026-09-07T22:00:00Z"));
            assertThat(slots.get(slots.size() - 1).endsAt())
                    .isEqualTo(Instant.parse("2026-09-08T01:00:00Z"));
        }

        @Test
        @DisplayName("Under DST, a day is anchored to local time and not to a fixed offset")
        void daylightSavingShiftsTheInstants() {
            // Same declared hours, same date, two zones: Paris is at +02:00 in
            // September, so its 09:00 is 07:00Z while Conakry's is 09:00Z. Any
            // code that treated local time as UTC would pass in Conakry and be
            // two hours wrong in Paris.
            LocalDate date = LocalDate.of(2026, 9, 7);

            Instant conakry = SlotCalculator.bookable(aQuery()
                    .on(date).zone(CONAKRY)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .build()).get(0).startsAt();

            Instant paris = SlotCalculator.bookable(aQuery()
                    .on(date).zone(PARIS)
                    .rule(DayOfWeek.MONDAY, window("09:00", "12:00"))
                    .build()).get(0).startsAt();

            assertThat(conakry).isEqualTo(Instant.parse("2026-09-07T09:00:00Z"));
            assertThat(paris).isEqualTo(Instant.parse("2026-09-07T07:00:00Z"));
        }

        @Test
        @DisplayName("The autumn day with a repeated hour is 25 hours long, not 24")
        void autumnTransitionLengthensTheDay() {
            // Paris falls back on 2026-10-25: 03:00 local occurs twice.
            LocalDate fallBack = LocalDate.of(2026, 10, 25);
            InstantRange open = window("00:00", "23:00").on(fallBack, PARIS);

            assertThat(Duration.between(open.from(), open.until())).isEqualTo(Duration.ofHours(24));
        }
    }

    /** Keeps each test to the one thing it varies. */
    static final class Builder {
        private LocalDate date = MONDAY;
        private ZoneId zone = CONAKRY;
        private final List<AvailabilityRule> rules = new java.util.ArrayList<>();
        private final List<AvailabilityOverride> overrides = new java.util.ArrayList<>();
        private final List<InstantRange> busy = new java.util.ArrayList<>();
        private Duration service = Duration.ofMinutes(30);
        private Duration before = Duration.ZERO;
        private Duration after = Duration.ZERO;
        private BookingPolicy policy = new BookingPolicy(Duration.ofMinutes(15), Duration.ZERO, 365);
        private Instant now = NOW;

        Builder on(LocalDate d) { this.date = d; return this; }
        Builder zone(ZoneId z) { this.zone = z; return this; }
        Builder rule(DayOfWeek d, LocalWindow w) { rules.add(AvailabilityRule.of(d, w)); return this; }
        Builder rawRule(AvailabilityRule r) { rules.add(r); return this; }
        Builder override(AvailabilityOverride o) { overrides.add(o); return this; }
        Builder busy(InstantRange r) { busy.add(r); return this; }
        Builder service(Duration d) { this.service = d; return this; }
        Builder buffers(Duration b, Duration a) { this.before = b; this.after = a; return this; }
        Builder policy(BookingPolicy p) { this.policy = p; return this; }
        Builder now(Instant i) { this.now = i; return this; }

        SlotQuery build() {
            return new SlotQuery(date, date, zone, rules, overrides, busy,
                                 service, before, after, policy, now);
        }
    }
}
