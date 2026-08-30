package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * No such member, or not the caller's.
 *
 * <p>One answer for both, byte for byte. Row-Level Security is what makes
 * another provider's staff invisible rather than forbidden, so this is reached
 * by an update that matched nothing and cannot tell the two apart - which is
 * the property, not a limitation.
 */
public final class StaffNotFoundException extends DomainException {

    public StaffNotFoundException(java.util.UUID id) {
        super("RESOURCE_NOT_FOUND", 404, "No such staff member",
              Map.of("staff_id", id.toString()));
    }
}
