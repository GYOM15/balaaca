package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * The code names no invitation that can still be redeemed.
 *
 * <p>Unknown, expired, already spent and belonging to a suspended business are
 * one answer, byte for byte. Telling them apart would say whether a code ever
 * existed to anyone who guesses one.
 *
 * <p>It carries nothing, not even the code: a code is the whole authorisation
 * for a seat, so echoing it into an error body puts it in logs and proxies that
 * had no reason to hold it.
 */
public final class InvitationNotFoundException extends DomainException {

    public InvitationNotFoundException() {
        super("RESOURCE_NOT_FOUND", 404, "No such invitation");
    }
}
