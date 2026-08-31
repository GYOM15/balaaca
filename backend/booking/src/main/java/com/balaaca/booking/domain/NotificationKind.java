package com.balaaca.booking.domain;

/**
 * The kinds booking produces today. The {@code notifications} table's CHECK
 * admits RESCHEDULE as well; it is absent here because no use case emits one
 * yet, and an enum constant nothing can produce is a promise the code does not
 * keep.
 */
public enum NotificationKind {

    /** To the customer, as soon as the booking exists. "We have your request." */
    BOOKING_CONFIRMATION,

    /**
     * To the customer, when a provider that vets its bookings accepts one.
     * "The salon is expecting you."
     *
     * <p>Separate from BOOKING_CONFIRMATION because they say different things,
     * and a template that has to mean both means neither. It exists at all
     * because confirming used to notify nobody: the one message a waiting
     * customer wanted was the one the system never sent.
     */
    BOOKING_ACCEPTED,

    /** To the provider, so a new booking does not depend on them refreshing a page. */
    BOOKING_NOTICE,

    /** To the customer, before the appointment. The instant it is owed for tells two apart. */
    REMINDER,

    /** To the customer, when their appointment is called off. */
    CANCELLATION,

    /** To the customer, when their appointment moves. */
    RESCHEDULE
}
