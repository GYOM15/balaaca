package com.balaaca.platformkernel.ratelimit;

import java.time.Duration;

/**
 * How many times one actor may try something in a window.
 *
 * <p>A port and not a helper, because the only honest implementation is out of
 * process. A counter in a field is per-instance: two application nodes give an
 * attacker twice the budget, and a restart gives them a fresh one. Redis is
 * already in the compose file and has been unused since it was put there.
 *
 * <p>Deliberately not an interceptor, though rate limiting usually is. There is
 * one call site, the budget it protects is a business rule about abuse rather
 * than a cross-cutting concern, and a binding plus a priority plus a
 * configuration key for one method would be more machinery than the rule.
 */
public interface AttemptLimiter {

    /**
     * Counts one attempt and says whether it is within budget.
     *
     * <p>Counts the attempt even when it refuses, so hammering a limit that has
     * already been reached keeps it reached rather than letting the window slide
     * open under load.
     *
     * @param key what is being limited and for whom, already scoped by the
     *            caller - this class does not know what a subject is
     * @param window how long the budget lasts, starting at the first attempt
     */
    boolean withinBudget(String key, int allowed, Duration window);
}
