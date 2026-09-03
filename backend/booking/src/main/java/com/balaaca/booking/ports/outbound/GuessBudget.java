package com.balaaca.booking.ports.outbound;

import java.time.Duration;

/**
 * How many wrong booking references one caller may produce in a window.
 *
 * <p>A port of this context's own, and not
 * {@code com.balaaca.platformkernel.ratelimit.AttemptLimiter}, for one reason:
 * that one FAILS OPEN when the counter is unreachable and this one must not.
 * The two are the same mechanism holding two different things. There the budget
 * makes enumerating handles expensive on a route that is authenticated anyway,
 * so an unreachable Redis had better let people sign up. Here the budget IS the
 * second half of the authorisation - a reference is six symbols over an alphabet
 * of 31, and it is short enough to say down a telephone precisely because
 * walking that space is refused - so an unreachable Redis that let everything
 * through would silently remove the condition the short reference was accepted
 * under.
 *
 * <p>Reading and counting are separate operations rather than one
 * {@code withinBudget}, because they answer different questions at different
 * moments: whether this caller may try at all is asked before the lookup, and
 * the charge is made afterwards and only if the reference named nothing. A
 * customer holding a real reference never spends anything.
 */
public interface GuessBudget {

    /**
     * Whether this caller may try another reference.
     *
     * @param key what is being limited and for whom, already composed by the
     *            caller - this port does not know what a caller is
     * @return false when the budget is spent AND when it cannot be read at all
     */
    boolean hasBudget(String key, int allowed);

    /**
     * Counts one reference that named nothing.
     *
     * <p>The window starts at the first miss and does not slide forward with
     * every one after it, so a caller who keeps guessing keeps the limit reached
     * rather than pushing its expiry ahead of themselves.
     */
    void charge(String key, Duration window);
}
