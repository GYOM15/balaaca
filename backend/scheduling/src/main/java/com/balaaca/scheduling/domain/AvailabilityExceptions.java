package com.balaaca.scheduling.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;
import java.util.UUID;

/** What the availability surface can refuse, in the language the API publishes. */
public final class AvailabilityExceptions {

    private AvailabilityExceptions() {
    }

    /**
     * A window that starts and ends at the same time. Not a wrap - a wrap is
     * end before start, which a provider open until one in the morning needs -
     * but a window of no length, which the database refuses too.
     */
    public static final class EmptyWindowException extends DomainException {
        public EmptyWindowException(int dayOfWeek) {
            super("VALIDATION_FAILED", 400, "A window must have a length",
                  Map.of("day_of_week", String.valueOf(dayOfWeek)));
        }
    }

    /** No such staff member, or not the caller's - the same answer, deliberately. */
    public static final class UnknownStaffException extends DomainException {
        public UnknownStaffException(UUID staffId) {
            super("RESOURCE_NOT_FOUND", 404, "No such staff member",
                  Map.of("staff_id", String.valueOf(staffId)));
        }
    }

    public static final class ClosureNotFoundException extends DomainException {
        public ClosureNotFoundException(UUID id) {
            super("RESOURCE_NOT_FOUND", 404, "No such closure",
                  Map.of("closure_id", String.valueOf(id)));
        }
    }
}
