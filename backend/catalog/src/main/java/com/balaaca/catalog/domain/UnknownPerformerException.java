package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.error.DomainException;
import com.balaaca.sharedkernel.ids.StaffId;
import java.util.Map;

/**
 * A named performer is not on this provider's team.
 *
 * <p>Refused rather than skipped. A replace that silently dropped the names it
 * did not recognise would report success and leave a service performed by fewer
 * people than the provider just said, which they would discover when a booking
 * went to the wrong chair.
 */
public final class UnknownPerformerException extends DomainException {

    public UnknownPerformerException(StaffId staffId) {
        super("VALIDATION_FAILED", 400, "No such team member",
              Map.of("staff_id", staffId.value().toString()));
    }
}
