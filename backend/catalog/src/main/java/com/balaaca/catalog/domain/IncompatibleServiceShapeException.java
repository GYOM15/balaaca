package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

/**
 * A set of fulfilment modes that does not describe a service anybody can buy.
 *
 * <p>Until V044 there was one such shape - dropped off AND travelled to, which
 * asked the customer to deliver an item to their own house - and that pairing is
 * now legal: "bring it in, or I come to you" is a real offer. What is refused
 * instead is a service obtainable no way at all, and a turnaround that has come
 * adrift from the mode it is a promise about.
 *
 * <p>CHECKs on the table refuse the same states. These exist so the refusal
 * reaches the provider as a sentence rather than as a constraint name in a 500 -
 * the contract cannot express any of them, so nothing catches them earlier.
 */
public final class IncompatibleServiceShapeException extends DomainException {

    private IncompatibleServiceShapeException(String message, Map<String, Object> details) {
        super("VALIDATION_FAILED", 400, message, details);
    }

    /** Mirrors {@code ck_service_offerings_offers_one}. */
    public static IncompatibleServiceShapeException offeredNoWay() {
        return new IncompatibleServiceShapeException(
                "A service must be obtainable in at least one way",
                Map.of("fulfilments", "empty"));
    }

    public static IncompatibleServiceShapeException repeatedMode() {
        return new IncompatibleServiceShapeException(
                "Each way of obtaining a service is listed once",
                Map.of("fulfilments", "repeated"));
    }

    public static IncompatibleServiceShapeException bothSpellings() {
        return new IncompatibleServiceShapeException(
                "Send fulfilments or location, not both",
                Map.of("location", "superseded"));
    }

    /**
     * Mirrors {@code ck_service_offerings_turnaround_is_drop_off}. Both
     * directions matter: a delay on a service nothing is handed over for is a
     * number no customer will ever be told, and a drop-off with no delay
     * announced is a promise nobody made.
     */
    public static IncompatibleServiceShapeException turnaroundWithoutDropOff() {
        return new IncompatibleServiceShapeException(
                "A turnaround belongs to a service that is dropped off",
                Map.of("turnaround_hours", "present", "fulfilments", "no DROP_OFF"));
    }

    public static IncompatibleServiceShapeException dropOffWithoutTurnaround() {
        return new IncompatibleServiceShapeException(
                "A service that is dropped off must say when it will be ready",
                Map.of("turnaround_hours", "absent", "fulfilments", "DROP_OFF"));
    }
}
