package com.balaaca.booking.domain;

/**
 * The kinds booking produces today. The {@code notifications} table's CHECK
 * admits CANCELLATION and RESCHEDULE as well; they are absent here because no
 * use case emits them yet, and an enum constant nothing can produce is a
 * promise the code does not keep.
 */
public enum NotificationKind {

    /** To the customer, as soon as the booking exists. */
    BOOKING_CONFIRMATION,

    /** To the provider, so a new booking does not depend on them refreshing a page. */
    BOOKING_NOTICE,

    /** To the customer, before the appointment. The instant it is owed for tells two apart. */
    REMINDER
}
