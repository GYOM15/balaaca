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
    RESCHEDULE,

    /**
     * To the provider, when the CUSTOMER calls their appointment off.
     *
     * <p>Its own kind rather than a second recipient on CANCELLATION, for two
     * reasons and both matter. The dedupe key is intent plus the instant it is
     * owed for and carries no recipient, so two rows of one kind at one instant
     * would collide on the UNIQUE index and one of them would be silently
     * dropped. And the two messages say different things to different people -
     * one names the business, the other names the customer - which is the same
     * reason BOOKING_NOTICE is not BOOKING_CONFIRMATION.
     *
     * <p>Planned only when the customer initiated it. A provider told about
     * their own cancellation is a provider learning to ignore the channel.
     */
    CANCELLATION_NOTICE,

    /** To the provider, when the CUSTOMER moves their appointment. */
    RESCHEDULE_NOTICE
}
