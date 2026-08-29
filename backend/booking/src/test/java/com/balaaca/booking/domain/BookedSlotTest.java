package com.balaaca.booking.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The slot arithmetic has to agree exactly with what the database recomputes in
 * ck_appointments_block_derived. A mismatch of one minute is a rejected insert
 * at runtime, so it is worth pinning here where the failure is readable.
 */
class BookedSlotTest {

    private static final Instant TEN = Instant.parse("2026-09-01T10:00:00Z");

    @Test
    @DisplayName("Blocks the buffers around the visible appointment")
    void blocksBuffers() {
        BookedSlot slot = BookedSlot.from(TEN, Duration.ofMinutes(60),
                                          Duration.ofMinutes(15), Duration.ofMinutes(10));

        assertThat(slot.startsAt()).isEqualTo(TEN);
        assertThat(slot.endsAt()).isEqualTo(Instant.parse("2026-09-01T11:00:00Z"));
        assertThat(slot.blockedFrom()).isEqualTo(Instant.parse("2026-09-01T09:45:00Z"));
        assertThat(slot.blockedUntil()).isEqualTo(Instant.parse("2026-09-01T11:10:00Z"));
    }

    @Test
    @DisplayName("Without buffers the blocked window is the appointment itself")
    void noBuffers() {
        BookedSlot slot = BookedSlot.from(TEN, Duration.ofMinutes(30), Duration.ZERO, Duration.ZERO);

        assertThat(slot.blockedFrom()).isEqualTo(slot.startsAt());
        assertThat(slot.blockedUntil()).isEqualTo(slot.endsAt());
    }

    @Test
    @DisplayName("Reports the buffers in minutes, as the derived CHECK expects")
    void reportsBufferMinutes() {
        BookedSlot slot = BookedSlot.from(TEN, Duration.ofMinutes(60),
                                          Duration.ofMinutes(15), Duration.ofMinutes(10));

        assertThat(slot.bufferBeforeMinutes()).isEqualTo(15);
        assertThat(slot.bufferAfterMinutes()).isEqualTo(10);
    }

    @Test
    @DisplayName("Refuses a zero-length booking, which would block nothing at all")
    void refusesZeroDuration() {
        // An empty tstzrange overlaps nothing, so a zero-length booking would
        // slip past the exclusion constraint and let a slot be sold twice.
        assertThatThrownBy(() -> BookedSlot.from(TEN, Duration.ZERO, Duration.ZERO, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BookedSlot.from(TEN, Duration.ofMinutes(-5), Duration.ZERO, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
