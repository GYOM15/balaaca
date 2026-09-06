package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * An operator removed this review, and that is the end of it.
 *
 * <p>Terminal on purpose. If amending a hidden review were allowed, amending
 * would be the way back out of moderation: post, get taken down, post again,
 * for as long as the writer has patience - and they have more of it than the
 * operator does.
 *
 * <p>Said out loud rather than answered with a shrug. A review that has
 * silently vanished teaches its author that the site is broken.
 */
public final class ReviewTakenDownException extends DomainException {

    public ReviewTakenDownException() {
        super("INVALID_STATE_TRANSITION", 409,
              "This review was taken down and cannot be rewritten", Map.of());
    }
}
