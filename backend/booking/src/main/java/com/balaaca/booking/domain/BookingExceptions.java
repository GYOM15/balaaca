package com.balaaca.booking.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** The failures the booking path can produce, and the status each maps to. */
public final class BookingExceptions {

    private BookingExceptions() {
    }

    /** The slot is taken. Terminal: re-fetching availability is the only recourse. */
    public static final class SlotUnavailableException extends DomainException {

        /**
         * The staff member is deliberately absent from the MESSAGE: on the
         * any-staff path the server chose them, so naming them would tell a
         * caller who is busy when, about a person they never asked about. It is
         * carried in details, which the audit log reads, the retry loop uses to
         * skip that candidate, and the client never sees.
         */
        public SlotUnavailableException(Instant startsAt, UUID staffId) {
            super("SLOT_UNAVAILABLE", 409, "That slot is no longer available",
                  Map.of("starts_at", startsAt.toString(),
                         "staff_id", String.valueOf(staffId)));
        }

        public SlotUnavailableException(Instant startsAt) {
            super("SLOT_UNAVAILABLE", 409, "That slot is no longer available",
                  Map.of("starts_at", startsAt.toString()));
        }
    }

    /**
     * Every eligible staff member is booked. Same published code as a taken
     * slot: from the customer's side the outcome is identical, and a distinct
     * code would leak how many people work there.
     */
    public static final class NoEligibleStaffException extends DomainException {
        public NoEligibleStaffException(Instant startsAt) {
            super("SLOT_UNAVAILABLE", 409, "That slot is no longer available",
                  Map.of("starts_at", startsAt.toString()));
        }
    }

    /**
     * Two transactions deadlocked competing for the slot. Retryable, and
     * deliberately NOT a conflict: PostgreSQL broke a wait cycle, which says
     * nothing about whether the slot is free. Never surfaced to a client.
     */
    public static final class TransientBookingConflictException extends DomainException {
        public TransientBookingConflictException(Throwable cause) {
            super("INTERNAL_ERROR", 500, "Booking contended", Map.of(), cause);
        }
    }

    /** Retries exhausted. The system is contended, not the slot. */
    public static final class BookingContendedException extends DomainException {
        public BookingContendedException(Instant startsAt) {
            super("RATE_LIMITED", 429, "Too many bookings at once, please retry",
                  Map.of("starts_at", startsAt.toString()));
        }
    }

    /** The appointment cannot leave the state it is in. */
    public static final class InvalidStateTransitionException extends DomainException {
        public InvalidStateTransitionException(AppointmentStatus from, AppointmentStatus to) {
            // The states are in details, not in the message. Which state an
            // appointment is in is the caller's own business here, but the
            // message is the one thing that reaches a client verbatim and the
            // habit of putting data in it is what eventually leaks somebody
            // else's.
            super("INVALID_STATE_TRANSITION", 409,
                  "That appointment can no longer change",
                  Map.of("from", from.name(), "to", to.name()));
        }
    }

    /** Same idempotency key, different request body. */
    public static final class IdempotencyKeyReusedException extends DomainException {
        public IdempotencyKeyReusedException(String key) {
            super("IDEMPOTENCY_KEY_REUSED", 422,
                  "This idempotency key was already used for a different request",
                  Map.of("idempotency_key", String.valueOf(key)));
        }
    }

    /** The slot falls outside what the provider actually offers. */
    public static final class SlotOutsideAvailabilityException extends DomainException {
        public SlotOutsideAvailabilityException(Instant startsAt, String why) {
            super("SLOT_OUTSIDE_AVAILABILITY", 422, "That time cannot be booked",
                  Map.of("starts_at", startsAt.toString(), "reason", why));
        }
    }

    public static final class AppointmentNotFoundException extends DomainException {
        public AppointmentNotFoundException(UUID id) {
            super("RESOURCE_NOT_FOUND", 404, "No such appointment",
                  Map.of("appointment_id", String.valueOf(id)));
        }
    }
}
