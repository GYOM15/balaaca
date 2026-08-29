package com.balaaca.booking.domain;

/**
 * Where a booking came from. An enum rather than a string because the database
 * already constrains the column to exactly these four values: a typo would
 * otherwise travel all the way to a CHECK violation at insert time, which is a
 * 500 for what the compiler could have refused.
 */
public enum BookingSource {

    /** The provider's public page. The customer is not authenticated. */
    PUBLIC,
    /** The provider or their staff, booking on a customer's behalf. */
    DASHBOARD,
    CHATBOT,
    ADMIN
}
