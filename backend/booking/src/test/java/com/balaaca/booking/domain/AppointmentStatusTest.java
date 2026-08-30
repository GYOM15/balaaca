package com.balaaca.booking.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * Every transition, legal and illegal, asserted one by one.
 *
 * <p>Twenty-five pairs rather than a handful of examples: the interesting ones
 * are the pairs nobody thinks of - confirming something cancelled, cancelling
 * something completed - and a test that lists only the transitions it expects
 * to work will happily pass while all of those are allowed.
 */
class AppointmentStatusTest {

    private static final Map<AppointmentStatus, Set<AppointmentStatus>> EXPECTED = Map.of(
            AppointmentStatus.PENDING,
            Set.of(AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED),
            AppointmentStatus.CONFIRMED,
            Set.of(AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW,
                   AppointmentStatus.CANCELLED),
            AppointmentStatus.CANCELLED, Set.of(),
            AppointmentStatus.COMPLETED, Set.of(),
            AppointmentStatus.NO_SHOW, Set.of());

    @ParameterizedTest
    @EnumSource(AppointmentStatus.class)
    @DisplayName("Each state accepts exactly the moves the machine allows")
    void everyPairIsDecided(AppointmentStatus from) {
        for (AppointmentStatus to : AppointmentStatus.values()) {
            assertThat(from.canBecome(to))
                    .as("%s -> %s", from, to)
                    .isEqualTo(EXPECTED.get(from).contains(to));
        }
    }

    @Test
    @DisplayName("Nothing leaves a terminal state, including itself")
    void terminalStatesAreTerminal() {
        Stream.of(AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED,
                  AppointmentStatus.NO_SHOW)
                .forEach(terminal -> {
                    assertThat(terminal.isTerminal()).as("%s", terminal).isTrue();
                    for (AppointmentStatus to : AppointmentStatus.values()) {
                        assertThat(terminal.canBecome(to)).as("%s -> %s", terminal, to).isFalse();
                    }
                });
    }

    @Test
    @DisplayName("An active state is not terminal, or cancelling could never work")
    void activeStatesAreNot() {
        assertThat(AppointmentStatus.PENDING.isTerminal()).isFalse();
        assertThat(AppointmentStatus.CONFIRMED.isTerminal()).isFalse();
    }
}
