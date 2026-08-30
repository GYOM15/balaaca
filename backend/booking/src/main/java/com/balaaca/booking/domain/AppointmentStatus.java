package com.balaaca.booking.domain;

/**
 * Where an appointment is in its life, as the {@code appointments} CHECK spells
 * it. A value here the column does not admit would fail at the end of a write
 * that had already decided it succeeded.
 */
public enum AppointmentStatus {
    PENDING,
    CONFIRMED,
    CANCELLED,
    COMPLETED,
    NO_SHOW;

    /** The two a provider is looking at when they open their day. */
    public static final String ACTIVE = "PENDING,CONFIRMED";
}
