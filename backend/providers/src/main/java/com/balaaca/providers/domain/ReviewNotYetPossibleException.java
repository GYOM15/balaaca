package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * There is nothing to review yet, or there never will be.
 *
 * <p>The appointment is still ahead, or it was cancelled, or the customer did
 * not turn up. All three mean the same thing to the person asking - they were
 * not served - and telling them apart would say more about somebody else's
 * diary than a caller holding one reference is owed.
 *
 * <p>Deliberately not gated on {@code COMPLETED}. Completion is a button the
 * provider presses, and a busy salon does not press buttons after a customer
 * leaves; that rule would have put the whole feature behind an action nobody
 * performs.
 */
public final class ReviewNotYetPossibleException extends DomainException {

    public ReviewNotYetPossibleException() {
        super("INVALID_STATE_TRANSITION", 409,
              "This appointment cannot be reviewed", Map.of());
    }
}
