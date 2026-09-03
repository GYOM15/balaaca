package com.balaaca.scheduling.domain;

import java.time.LocalTime;

/**
 * A stretch of the recurring week during which a provider is open, in the
 * provider's own local time.
 *
 * <p>Not an {@code AvailableSlot}: this says the door is open, not that anything
 * can be booked. The two are published separately and deliberately - hours are
 * already public, a minute-by-minute record of who is busy is not.
 *
 * @param dayOfWeek ISO numbering, 1 is Monday
 */
public record OpenWindow(int dayOfWeek, LocalTime start, LocalTime end) {

    /**
     * An end before a start is a window that runs past midnight, which is a real
     * thing for a provider open until one in the morning. The database allows it
     * and refuses only equality.
     */
    public boolean wrapsMidnight() {
        return end.isBefore(start);
    }
}
