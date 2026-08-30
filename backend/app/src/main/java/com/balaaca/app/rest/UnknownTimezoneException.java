package com.balaaca.app.rest;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The IANA zone does not exist on this platform's tzdb.
 *
 * <p>Refused at the edge rather than stored: a zone is what turns a provider's
 * declared local hours into instants, and a wrong one is discovered by a
 * reminder that fires at the wrong hour, weeks later.
 */
public final class UnknownTimezoneException extends DomainException {

    public UnknownTimezoneException(String requested) {
        super("VALIDATION_FAILED", 400, "No such timezone", Map.of("timezone", requested));
    }
}
