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

    /**
     * Whether reaching this state is a claim about an appointment that has
     * already happened.
     *
     * <p>Both of them are: "terminé" says the work was done and "absent" says
     * the customer did not come to it. Neither can be true of a Thursday while
     * it is Monday, and nothing stopped a provider saying so - the button sat
     * on every confirmed row whatever its date, so a diary could be closed out
     * a week in advance and the month's takings counted from work nobody had
     * started. It is not the enforcement: the UPDATE that carries this is.
     */
    public boolean meansItAlreadyHappened() {
        return this == COMPLETED || this == NO_SHOW;
    }
}
