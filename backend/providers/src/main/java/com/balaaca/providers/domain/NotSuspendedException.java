package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * There is nothing to contest.
 *
 * <p>422 rather than 403: the caller is perfectly entitled to this route, and
 * the request is well formed. What is absent is the decision it answers -
 * accepting it would put a message in the operator's queue about a suspension
 * nobody made.
 */
public final class NotSuspendedException extends DomainException {

    public NotSuspendedException() {
        super("VALIDATION_FAILED", 422, "This business is not suspended", Map.of());
    }
}
