package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The person still has customers booked with them.
 *
 * <p>Refused rather than repaired, because both automatic repairs are worse
 * than the refusal: cancelling punishes the customer for the salon's staffing,
 * and silently moving the appointments sends somebody to a person they did not
 * choose. Both are things the provider can already do on purpose - move the
 * appointment to a colleague, or cancel it and let the customer be told.
 *
 * <p>409 rather than 422: the request is perfectly valid and will succeed
 * unchanged once the diary is clear. That is what a conflict is.
 */
public final class StaffStillBookedException extends DomainException {

    public StaffStillBookedException() {
        super("INVALID_STATE_TRANSITION", 409,
              "This team member still has upcoming appointments",
              Map.of("remedy", "move them to a colleague, or cancel them, first"));
    }
}
