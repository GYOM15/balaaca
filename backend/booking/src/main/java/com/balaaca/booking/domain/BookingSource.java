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
    ADMIN;

    /**
     * Whether what the provider PUBLISHED constrains this booking.
     *
     * <p>The booking policy and the declared availability exist to protect a
     * customer and to stop a stranger taking a slot at three in the morning:
     * enough notice to react, a horizon that is not a year, a door that is
     * open. None of that restrains the provider writing in their own diary.
     * Somebody is standing at the counter; the shop closes in ten minutes; the
     * appointment happened and has to be recorded. A diary that refuses is a
     * diary the salon keeps on paper instead.
     *
     * <p>Exactly one rule is never waived, for any source: two people cannot
     * hold one chair at one time. That is the exclusion constraint's, it is
     * taken inside the INSERT, and nothing here can reach it.
     */
    public boolean honoursPublishedAvailability() {
        return this == PUBLIC || this == CHATBOT;
    }

    /**
     * Whether a refusal the provider recorded against a customer applies.
     *
     * <p>A block is the provider saying "not this person, not on my page". It
     * binds the page and not the counter: the same somebody may still be
     * standing in the salon with the argument settled, and a diary that refuses
     * to record what is happening is a diary the salon keeps on paper.
     *
     * <p>The same partition as the two questions above today, and a third
     * question. They are stated apart because the day a source moves on one
     * axis it will not move on all three.
     */
    public boolean honoursCustomerBlocking() {
        return this == PUBLIC || this == CHATBOT;
    }

    /**
     * Whether entering it was already the acceptance.
     *
     * <p>A provider's auto_confirm answers "do I want to look at each request
     * before it is in my book?", and the request it is about is a stranger's.
     * When the provider is the one typing, there is nobody left to accept:
     * leaving a walk-in PENDING would put the salon's own entry in its own
     * queue, waiting for itself.
     *
     * <p>The same partition as {@link #honoursPublishedAvailability()} today,
     * and a different question - one is about what binds the booking, this is
     * about who agreed to it. They are stated apart because the day a source
     * moves on one axis it will not move on both.
     */
    public boolean arrivesAccepted() {
        return this == DASHBOARD || this == ADMIN;
    }
}
