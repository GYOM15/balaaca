package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

public final class ReviewNotFoundException extends DomainException {

    public ReviewNotFoundException(java.util.UUID id) {
        super("RESOURCE_NOT_FOUND", 404, "No such review",
              Map.of("review_id", id.toString()));
    }
}
