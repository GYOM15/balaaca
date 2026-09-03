package com.balaaca.scheduling.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Turning several people's weeks into one shop's week.
 *
 * <p>The whole point of this class is what a customer reads off a public page,
 * so the cases that matter are the ones that would draw wrong: a Tuesday drawn
 * twice, a lunch break invented between two shifts that touch, or a window that
 * disappears because it runs past midnight.
 */
class OpeningWeekTest {

    private static OpenWindow window(int day, String start, String end) {
        return new OpenWindow(day, LocalTime.parse(start), LocalTime.parse(end));
    }

    @Nested
    @DisplayName("Within one day")
    class OneDay {

        @Test
        @DisplayName("Nothing declared is nothing published")
        void mergesAnEmptyWeekToNothing() {
            assertThat(OpeningWeek.merge(List.of())).isEmpty();
        }

        @Test
        @DisplayName("A single window is left exactly as it was")
        void keepsALoneWindow() {
            assertThat(OpeningWeek.merge(List.of(window(2, "08:00", "17:00"))))
                    .containsExactly(window(2, "08:00", "17:00"));
        }

        @Test
        @DisplayName("Two people on the same shift are one open window, not two")
        void mergesIdenticalWindows() {
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "08:00", "17:00"),
                    window(2, "08:00", "17:00"))))
                    .containsExactly(window(2, "08:00", "17:00"));
        }

        @Test
        @DisplayName("Overlapping shifts become the stretch they cover together")
        void mergesOverlappingWindows() {
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "08:00", "13:00"),
                    window(2, "11:00", "19:00"))))
                    .containsExactly(window(2, "08:00", "19:00"));
        }

        @Test
        @DisplayName("Touching shifts leave no gap, because there is none")
        void mergesTouchingWindows() {
            // A morning that ends at noon beside an afternoon that starts at
            // noon is one open day. Left unmerged it draws as a lunch break the
            // provider never declared.
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "08:00", "12:00"),
                    window(2, "12:00", "18:00"))))
                    .containsExactly(window(2, "08:00", "18:00"));
        }

        @Test
        @DisplayName("A shift inside another adds nothing")
        void swallowsAContainedWindow() {
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "08:00", "20:00"),
                    window(2, "10:00", "12:00"))))
                    .containsExactly(window(2, "08:00", "20:00"));
        }

        @Test
        @DisplayName("A real gap between shifts is kept")
        void keepsADisjointWindow() {
            // The shop genuinely shuts between one and three. Merging these
            // would advertise an hour nobody is there.
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "08:00", "13:00"),
                    window(2, "15:00", "19:00"))))
                    .containsExactly(window(2, "08:00", "13:00"), window(2, "15:00", "19:00"));
        }

        @Test
        @DisplayName("Three that chain collapse into one")
        void mergesAChain() {
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "08:00", "10:00"),
                    window(2, "09:30", "12:00"),
                    window(2, "11:00", "18:00"))))
                    .containsExactly(window(2, "08:00", "18:00"));
        }

        @Test
        @DisplayName("The order they arrive in does not decide the answer")
        void doesNotDependOnInputOrder() {
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "15:00", "19:00"),
                    window(2, "08:00", "13:00"))))
                    .containsExactly(window(2, "08:00", "13:00"), window(2, "15:00", "19:00"));
        }
    }

    @Nested
    @DisplayName("Across the week")
    class WholeWeek {

        @Test
        @DisplayName("The same hours on two days stay two days")
        void neverMergesAcrossDays() {
            assertThat(OpeningWeek.merge(List.of(
                    window(2, "08:00", "17:00"),
                    window(3, "08:00", "17:00"))))
                    .containsExactly(window(2, "08:00", "17:00"), window(3, "08:00", "17:00"));
        }

        @Test
        @DisplayName("Monday first, Sunday last, whatever order they arrived in")
        void ordersTheWeekFromMonday() {
            assertThat(OpeningWeek.merge(List.of(
                    window(7, "10:00", "14:00"),
                    window(1, "08:00", "17:00"),
                    window(4, "09:00", "18:00"))).stream().map(OpenWindow::dayOfWeek))
                    .containsExactly(1, 4, 7);
        }
    }

    @Nested
    @DisplayName("Past midnight")
    class Wrapping {

        @Test
        @DisplayName("A window that runs into the next day is published as declared")
        void keepsAWrappingWindow() {
            // 22:00 to 01:00 is a real thing for a bar or a late salon, and the
            // database allows it. Dropping it would close a shop that is open.
            assertThat(OpeningWeek.merge(List.of(window(5, "22:00", "01:00"))))
                    .containsExactly(window(5, "22:00", "01:00"));
        }

        @Test
        @DisplayName("It does not swallow the ordinary shift beside it")
        void keepsBothWhenOneWraps() {
            assertThat(OpeningWeek.merge(List.of(
                    window(5, "09:00", "18:00"),
                    window(5, "22:00", "01:00"))))
                    .containsExactly(window(5, "09:00", "18:00"), window(5, "22:00", "01:00"));
        }

        @Test
        @DisplayName("An ordinary shift after it is still merged with its neighbours")
        void mergesAroundAWrappingWindow() {
            assertThat(OpeningWeek.merge(List.of(
                    window(5, "22:00", "01:00"),
                    window(5, "09:00", "13:00"),
                    window(5, "12:00", "18:00"))))
                    .containsExactly(window(5, "09:00", "18:00"), window(5, "22:00", "01:00"));
        }

        @Test
        @DisplayName("A window ending at midnight does not count as wrapping")
        void treatsMidnightEndAsWrapping() {
            // 00:00 is before 22:00, so this IS the wrapping shape as far as the
            // comparison goes, and it is published untouched rather than merged
            // into the evening beside it.
            assertThat(window(5, "22:00", "00:00").wrapsMidnight()).isTrue();
            assertThat(window(5, "08:00", "20:00").wrapsMidnight()).isFalse();
        }
    }
}
