package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;
import java.util.UUID;

public final class ServiceOfferingNotFoundException extends DomainException {

    public ServiceOfferingNotFoundException(UUID id) {
        // Same 404 a genuinely missing offering returns: under RLS an offering
        // belonging to another provider is simply invisible, and the response
        // must not let a caller tell the two apart.
        super("RESOURCE_NOT_FOUND", 404, "No such service offering",
              Map.of("service_offering_id", String.valueOf(id)));
    }
}
