package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * The page cannot go live because nothing on it can be booked.
 *
 * <p>A published page with no services or no opening hours is worse than no
 * page: a customer finds it, finds an empty calendar, and does not come back.
 * The provider gets told what is missing while they can still fix it.
 */
public final class NothingToPublishException extends DomainException {

    public NothingToPublishException(String missing) {
        super("INVALID_STATE_TRANSITION", 409,
              "Nothing can be booked yet: " + missing);
    }
}
