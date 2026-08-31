package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * A suspension with nothing written in the box.
 *
 * <p>The contract asks for three characters and three spaces are three
 * characters, so the shape check cannot catch this one. It has to be refused
 * here rather than by the column's CHECK, which would reach the operator as a
 * 500 naming a constraint - and the reason is the entire point of the
 * operation: it is what the provider reads, and what the platform stands on the
 * day the decision is contested.
 */
public final class BlankModerationReasonException extends DomainException {

    public BlankModerationReasonException() {
        super("VALIDATION_FAILED", 400, "A suspension needs a reason",
              Map.of("reason", "blank"));
    }
}
