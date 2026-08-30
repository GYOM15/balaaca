package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * This account already runs a business.
 *
 * <p>One account, one provider, enforced by a unique index rather than by a
 * check-then-insert: two taps on a slow connection race, both read no
 * membership, and both write one. The database is what settles it, and this is
 * how the loser is told.
 *
 * <p>It carries nothing about the existing business, not even its name. The
 * caller either owns it - in which case they can read it through their own
 * profile - or something has gone wrong that a stranger must not learn about
 * from an error message.
 */
public final class AlreadyRegisteredException extends DomainException {

    public AlreadyRegisteredException() {
        super("ALREADY_REGISTERED", 409, "This account already has a business");
    }
}
