package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * Two live services with the same name are two things a customer cannot choose
 * between. The database says so with a partial unique index on the active rows,
 * and this is that answer in the language the API publishes.
 */
public final class DuplicateServiceNameException extends DomainException {

    public DuplicateServiceNameException(String name) {
        super("INVALID_STATE_TRANSITION", 409, "Another active service already has that name",
              Map.of("name", name));
    }
}
