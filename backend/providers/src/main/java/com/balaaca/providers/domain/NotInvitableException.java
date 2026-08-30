package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * That member cannot be invited.
 *
 * <p>Either they already have an account - a second code would be a second way
 * into a seat that is taken - or they are the owner, whose row is not claimable
 * by an invitation at all, in the function and in the policy behind it.
 */
public final class NotInvitableException extends DomainException {

    public NotInvitableException(String reason) {
        super("INVALID_STATE_TRANSITION", 409, "That member cannot be invited: " + reason,
              Map.of("reason", reason));
    }
}
