package com.balaaca.platformkernel.ratelimit;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The budget for this action is spent.
 *
 * <p>429 and the published RATE_LIMITED code, the same one a contended booking
 * uses. The two are not the same situation, but they are the same instruction to
 * the client - wait, then try again - and a second code would be a distinction
 * nobody acts on.
 *
 * <p>It says nothing about how much budget is left or when it returns. A limit
 * that reports its own window is a limit an attacker can pace themselves
 * against.
 */
public final class TooManyAttemptsException extends DomainException {

    public TooManyAttemptsException(String action) {
        super("RATE_LIMITED", 429, "Too many attempts, please try again later",
              Map.of("action", action));
    }
}
