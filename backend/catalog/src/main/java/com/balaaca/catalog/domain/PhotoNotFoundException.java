package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

public final class PhotoNotFoundException extends DomainException {

    public PhotoNotFoundException(java.util.UUID id) {
        super("RESOURCE_NOT_FOUND", 404, "No such photograph",
              Map.of("photo_id", id.toString()));
    }
}
