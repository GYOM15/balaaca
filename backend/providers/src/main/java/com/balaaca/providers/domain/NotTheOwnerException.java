package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The caller does not own this business.
 *
 * <p>403 and not 404: the caller is a member of this provider and knows it, so
 * hiding the business would be pretending they cannot see what they are looking
 * at. What they lack is the standing to give it away.
 */
public final class NotTheOwnerException extends DomainException {

    public NotTheOwnerException() {
        super("FORBIDDEN", 403, "Only the owner can hand the business over", Map.of());
    }
}
