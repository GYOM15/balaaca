package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The named colleague cannot be given the business.
 *
 * <p>One answer for three refusals - not on this team, no longer active, or has
 * no account - because the owner does the same thing with all three: pick
 * somebody else. Telling them apart would also say whether a staff id belongs
 * to another salon.
 *
 * <p>Handing the business to oneself lands here too. It is not an error worth
 * its own sentence, and it is not a transfer.
 */
public final class CannotOwnException extends DomainException {

    public CannotOwnException(java.util.UUID staffId) {
        super("VALIDATION_FAILED", 422,
              "This colleague cannot take the business over",
              Map.of("staff_id", staffId.toString(),
                     "requires", "an active team member with an account"));
    }
}
