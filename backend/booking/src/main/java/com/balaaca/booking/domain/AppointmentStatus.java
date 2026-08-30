package com.balaaca.booking.domain;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

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

    private static final Map<AppointmentStatus, Set<AppointmentStatus>> LEGAL = Map.of(
            PENDING, EnumSet.of(CONFIRMED, CANCELLED),
            CONFIRMED, EnumSet.of(COMPLETED, NO_SHOW, CANCELLED),
            CANCELLED, EnumSet.noneOf(AppointmentStatus.class),
            COMPLETED, EnumSet.noneOf(AppointmentStatus.class),
            NO_SHOW, EnumSet.noneOf(AppointmentStatus.class));

    /**
     * Whether this state may become that one.
     *
     * <p>Written here so it can be asserted exhaustively without a database,
     * and so the three terminal states are terminal by construction rather than
     * by everyone remembering. It is not what enforces the machine at runtime:
     * a transition is one conditional UPDATE whose WHERE clause names the
     * states it accepts, and the affected-row count is the answer. Two racers
     * both passing a check here would both then try to write, and only one
     * would find a row.
     */
    public boolean canBecome(AppointmentStatus next) {
        return LEGAL.get(this).contains(next);
    }

    /** Nothing leaves these. */
    public boolean isTerminal() {
        return LEGAL.get(this).isEmpty();
    }
}
