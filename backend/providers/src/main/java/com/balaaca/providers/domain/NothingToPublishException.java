package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * The page cannot go live because nothing on it can be booked.
 *
 * <p>Raised on the way in to publishing, and again on the way out of it: a
 * published page can be emptied after the fact by retiring the last service or
 * standing down the last bookable person, and the result is the same page with
 * the same empty calendar. A customer finds it, finds nothing, and does not come
 * back. The provider gets told what is missing while they can still fix it.
 */
public final class NothingToPublishException extends DomainException {

    public NothingToPublishException(String missing) {
        super("INVALID_STATE_TRANSITION", 409, "Nothing can be booked: " + missing);
    }
}
