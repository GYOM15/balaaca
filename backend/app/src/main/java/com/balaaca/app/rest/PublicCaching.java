package com.balaaca.app.rest;

/**
 * How long a public answer may be reused, and where it may be kept.
 *
 * <p>The first real gain for a customer on a mid-range Android over 3G in
 * Conakry is not a cache server - it is not making the request at all. These
 * headers cost nothing, work in the browser today and in front of a CDN later,
 * and a Redis layer would sit behind them rather than instead of them.
 *
 * <p>The durations are short on purpose. A minute of staleness on a directory is
 * invisible; an hour would mean a salon publishes its page and cannot show it to
 * anyone. What matters far more than the numbers is which answers are here and
 * which are {@link #NEVER}.
 */
final class PublicCaching {

    private PublicCaching() {
    }

    /** The trade taxonomy. It changes by migration, so an hour is conservative. */
    static final String TAXONOMY = "public, max-age=3600";

    /** The directory and a provider's page. A minute of staleness costs nothing. */
    static final String DIRECTORY = "public, max-age=60";

    /**
     * Hours and the team. They change when a provider edits them, which is
     * rarely, and being five minutes behind on a shop's opening hours has never
     * hurt anyone.
     */
    static final String SLOW_MOVING = "public, max-age=300";

    /**
     * Availability, and anything about one person's booking.
     *
     * <p>Availability is never cached, and this is the important line in the
     * file. A stale slot list sends a customer to a slot that is gone and shows
     * a salon as full while a chair is empty - which is exactly the defect the
     * union-across-chairs fix removed, produced again from the other direction.
     * Every booking changes the answer, so the answer cannot be reused.
     *
     * <p>A booking is a single customer's appointment reached by a capability.
     * It is not shared and must not sit in any intermediary.
     */
    static final String NEVER = "no-store";
}
