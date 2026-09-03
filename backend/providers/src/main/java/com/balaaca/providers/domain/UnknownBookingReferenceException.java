package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The reference names no appointment.
 *
 * <p>The message never says whether the reference is malformed, expired or
 * simply somebody else's: a capability that answers differently for a wrong
 * guess than for a near miss is a capability worth guessing at.
 */
public final class UnknownBookingReferenceException extends DomainException {

    public UnknownBookingReferenceException() {
        super("RESOURCE_NOT_FOUND", 404, "No such booking", Map.of());
    }
}
