package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * A service that is both dropped off and travelled to.
 *
 * <p>Drop-off means the customer brings the thing to the workshop and collects
 * it later; at-customer means the provider travels. A service that is both
 * would be asking the customer to deliver an item to their own house.
 *
 * <p>A CHECK on the table refuses it as well. This exists so the refusal
 * reaches the provider as a sentence rather than as a constraint name in a 500 -
 * the contract cannot express the exclusion, so nothing catches it earlier.
 */
public final class IncompatibleServiceShapeException extends DomainException {

    public IncompatibleServiceShapeException() {
        super("VALIDATION_FAILED", 400, "A call-out cannot also be dropped off",
              Map.of("location", "AT_CUSTOMER", "turnaround_hours", "present"));
    }
}
