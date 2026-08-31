package com.balaaca.providers.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

public final class ReportNotFoundException extends DomainException {

    public ReportNotFoundException(java.util.UUID id) {
        super("RESOURCE_NOT_FOUND", 404, "No such report",
              Map.of("report_id", id.toString()));
    }
}
