package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * The place does not exist on the published map.
 *
 * <p>Refused rather than quietly stored as none, for the same reason as an
 * unknown trade: a garage that picked "matoto" and silently got nothing would
 * not appear when a customer filters by Matoto, and would have no way to find
 * out. The quartier beside it is free text precisely because it CANNOT be
 * checked this way - this field can, so it is.
 */
public final class UnknownLocalityException extends DomainException {

    public UnknownLocalityException(String slug) {
        super("VALIDATION_FAILED", 400, "No such locality", Map.of("locality_slug", slug));
    }
}
