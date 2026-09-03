package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * This suspension has already been answered.
 *
 * <p>409 and not a silent success: a provider who sends a second message wants
 * to know whether it replaced the first or was ignored, and both answers are
 * wrong to give without saying which. Their first message stands, and the route
 * that reads it back is how they check.
 */
public final class AlreadyContestedException extends DomainException {

    public AlreadyContestedException() {
        super("INVALID_STATE_TRANSITION", 409,
              "You have already answered this suspension", Map.of());
    }
}
