package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The number that booked is the number the business publishes.
 *
 * <p>Booking your own service is allowed and stays allowed - an owner books for
 * their mother, and the person who built this books on his own page to check it
 * works. Writing the review afterwards is not, and this is where the two part.
 *
 * <p>A speed bump and not a lock, which is worth saying out loud so nobody
 * later mistakes it for one: a second telephone walks past it. It stops the
 * unthinking attempt, made with the handset in the room, which is the one that
 * actually happens. Anything stronger needs verified identity, and a customer
 * in Conakry has none and will not be asked for one.
 *
 * <p>{@code FORBIDDEN} rather than a code of its own, for the reason the
 * catalogue's own description gives - and the message says what is wrong
 * without saying how it was worked out. A sentence naming the comparison would
 * hand anybody holding a reference a way to ask whether a given number is the
 * business's own.
 */
public final class SelfReviewException extends DomainException {

    public SelfReviewException() {
        super("FORBIDDEN", 403,
              "This booking cannot be reviewed from the business's own number",
              Map.of());
    }
}
