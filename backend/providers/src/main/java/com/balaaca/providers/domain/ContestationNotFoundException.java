package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

public final class ContestationNotFoundException extends DomainException {

    public ContestationNotFoundException(java.util.UUID id) {
        super("RESOURCE_NOT_FOUND", 404, "No such contestation",
              Map.of("contestation_id", id.toString()));
    }
}
