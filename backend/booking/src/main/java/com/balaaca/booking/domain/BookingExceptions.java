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
     * This attempt lost for a reason that says nothing about the slot: either
     * two transactions deadlocked competing for it, or the reference drawn for
     * it is one somebody already holds. Retryable, and deliberately NOT a
     * conflict - the answer is a new transaction rather than a refusal, and the
     * mint happens again on the way through. Never surfaced to a client.
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

    /**
     * A chair that is not this provider's, or one nobody works any more.
     *
     * <p>The same 404 an unknown appointment gets, and deliberately: a colleague
     * at another salon is invisible to the read that asks, so telling the two
     * apart would turn the reschedule route into an oracle for who works where.
     */
    public static final class UnknownStaffException extends DomainException {
        public UnknownStaffException(java.util.UUID staffId) {
            super("RESOURCE_NOT_FOUND", 404, "No such staff member",
                  Map.of("staff_id", staffId.toString()));
        }
    }

    /**
     * The service can be had several ways and the request named none.
     *
     * <p>400 rather than a default. There is no defensible one between sitting
     * in a salon and having somebody come to your house: picking the first would
     * send a stranger to an address, and picking the last would leave a customer
     * waiting at home for nobody.
     *
     * <p>The modes travel as names rather than as the enum: this is a domain
     * type, and a domain that mentions another context makes every reshape over
     * there ripple in here.
     */
    public static final class FulfilmentNotChosenException extends DomainException {
        public FulfilmentNotChosenException(java.util.List<String> offered) {
            super("VALIDATION_FAILED", 400, "Choose how this service is to be carried out",
                  Map.of("fulfilments", offered));
        }
    }

    /**
     * A mode the service does not publish.
     *
     * <p>A client that has gone stale - the provider stopped travelling between
     * the page being drawn and the form being sent - so it names something that
     * is not on offer, exactly like an unknown service would.
     */
    public static final class FulfilmentNotOfferedException extends DomainException {
        public FulfilmentNotOfferedException(String chosen, java.util.List<String> offered) {
            super("VALIDATION_FAILED", 400, "This service is not carried out that way",
                  Map.of("fulfilment", chosen, "fulfilments", offered));
        }
    }

    /**
     * A call-out with nowhere to go, or a shop appointment carrying an address.
     *
     * <p>Both directions are refused, and the second matters as much as the
     * first: an appointment that happens at the salon must not carry somebody's
     * home address, because storing one for no reason is how a directory turns
     * into a list of where its customers live.
     *
     * <p>422 rather than 400: the body is well formed, and whether an address
     * is owed depends on the mode chosen, which only the server can check
     * against what the offering publishes.
     *
     * <p>It is the CHOICE that decides, not the service. A service offering
     * both shapes needs an address for one booking of it and must not hold one
     * for the next.
     */
    public static final class ServiceAddressMismatchException extends DomainException {
        public ServiceAddressMismatchException(boolean callOut) {
            super("VALIDATION_FAILED", 422,
                  callOut ? "This booking is at the customer's address"
                          : "This booking is at the provider's address",
                  Map.of("service_address", callOut ? "required" : "not accepted"));
        }
    }

    /**
     * No such customer, or not this provider's.
     *
     * <p>One answer for both, like every other lookup here: RLS removed the row
     * from the statement's reach before it ran, so the two are not even
     * distinguishable from inside.
     */
    public static final class CustomerNotFoundException extends DomainException {
        public CustomerNotFoundException(UUID id) {
            super("RESOURCE_NOT_FOUND", 404, "No such customer",
                  Map.of("customer_id", String.valueOf(id)));
        }
    }

    /**
     * The provider will not take a booking from this number on their page.
     *
     * <p>{@code customers.blocked} existed from V007 and nothing ever wrote it,
     * so a salon losing an hour a week to the same no-show had no lever at all.
     * This is the lever, and it is deliberately narrow: it refuses a NEW public
     * booking, it leaves appointments already in the book alone, and it does
     * not restrain the provider entering the same person at the counter.
     *
     * <p>{@code FORBIDDEN} rather than a code of its own. The catalogue is
     * closed and this is what a 403 means - the server understood, refuses, and
     * nothing the caller can send changes the answer. A new code would also have
     * to be published, and publishing one whose only job is to say "you are
     * blocked" hands the fact to every client that never needed it.
     *
     * <p>Nothing identifying is carried. The message reaches the caller verbatim
     * and says only that the booking cannot be taken online: this route is
     * unauthenticated, and a message that named the reason would let anybody who
     * can spell the slug read a salon's blocklist one telephone number at a
     * time. The details map is empty for the same reason - it is the audit
     * trail's, and a refused stranger's number is more personal data than the
     * action needs to be reconstructible.
     */
    public static final class CustomerBlockedException extends DomainException {
        public CustomerBlockedException() {
            super("FORBIDDEN", 403,
                  "This booking cannot be taken online", Map.of());
        }
    }

    /**
     * E-mail was chosen and no address was given.
     *
     * <p>400 and at the edge, because the alternative is the failure this is
     * here to prevent: the booking succeeds, four notification rows are written
     * with nothing in {@code to_email}, and the worker discovers it hours later
     * on a scheduled thread with nobody to answer. What the customer sees is a
     * confirmation that never arrives.
     *
     * <p>{@code VALIDATION_FAILED} rather than a code of its own. The catalogue
     * is closed, and this is what it means: the body is internally inconsistent
     * and the caller can fix it by sending an address or by not asking for
     * e-mail.
     *
     * <p>Nothing identifying is carried. The refusal is about a field that is
     * missing, and naming the address that is not there would be repeating a
     * personal datum for no diagnostic gain.
     */
    public static final class EmailChannelWithoutAddressException extends DomainException {
        public EmailChannelWithoutAddressException() {
            super("VALIDATION_FAILED", 400,
                  "An email address is required to be contacted by email",
                  Map.of("preferred_channel", "EMAIL"));
        }
    }

    /** A commune the published map does not hold. */
    public static final class UnknownServiceLocalityException extends DomainException {
        public UnknownServiceLocalityException(String slug) {
            super("VALIDATION_FAILED", 400, "No such locality",
                  Map.of("locality_slug", slug));
        }
    }

    /**
     * The named person does not perform this service.
     *
     * <p>422 and not 404: the staff member exists and is the provider's - they
     * are on the public page - so a 404 would be a lie the client could
     * disprove by reading the very list it picked the name from. What is
     * invalid is the pairing.
     *
     * <p>Answered rather than silently reassigned. Somebody who asked for Fatou
     * and got Mariame would find out in the chair.
     */
    public static final class StaffCannotPerformServiceException extends DomainException {
        public StaffCannotPerformServiceException(UUID staffId, UUID serviceOfferingId) {
            super("VALIDATION_FAILED", 422,
                  "This team member does not perform this service",
                  Map.of("staff_id", String.valueOf(staffId),
                         "service_offering_id", String.valueOf(serviceOfferingId)));
        }
    }

    /**
     * Nothing to be ready.
     *
     * <p>The customer sat in the chair and left with the result. Writing a
     * ready date on that appointment would put a message in front of somebody
     * telling them to come back for something they already have.
     *
     * <p>422 and not 409: the appointment is in a perfectly good state, the
     * request simply does not apply to this kind of service.
     */
    public static final class NotADropOffException extends DomainException {
        public NotADropOffException(UUID appointmentId) {
            super("VALIDATION_FAILED", 422,
                  "This appointment is not a drop-off",
                  Map.of("appointment_id", String.valueOf(appointmentId)));
        }
    }

    /** A promise cannot fall before the work was handed over. */
    public static final class PromiseBeforeHandoverException extends DomainException {
        public PromiseBeforeHandoverException(java.time.Instant readyBy) {
            super("VALIDATION_FAILED", 422,
                  "A job cannot be ready before it was handed over",
                  Map.of("ready_by", String.valueOf(readyBy)));
        }
    }

    public static final class AppointmentNotFoundException extends DomainException {
        public AppointmentNotFoundException(UUID id) {
            super("RESOURCE_NOT_FOUND", 404, "No such appointment",
                  Map.of("appointment_id", String.valueOf(id)));
        }
    }
    /**
     * Too late for the customer to call it off.
     *
     * <p>The window is the provider's own {@code cancellation_deadline_minutes},
     * a column that existed from V004 and was enforced nowhere - which is the
     * same as not having it. It binds the customer only: a salon cancelling its
     * own appointment is managing its diary, and refusing that would be absurd.
     *
     * <p>It carries the deadline so a client can say when it passed. That is not
     * a disclosure: the customer was told the policy when they booked, and it is
     * computed from their own appointment.
     */
    public static final class CancellationDeadlinePassedException extends DomainException {

        public CancellationDeadlinePassedException(Instant deadline) {
            super("CANCELLATION_DEADLINE_PASSED", 422,
                  "It is too late to cancel this appointment online",
                  Map.of("deadline", String.valueOf(deadline)));
        }
    }

}
