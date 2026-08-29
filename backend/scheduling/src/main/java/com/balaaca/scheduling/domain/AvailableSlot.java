package com.balaaca.scheduling.domain;

import java.time.Instant;

/**
 * A slot a customer can actually take.
 *
 * <p>There is deliberately no "available" flag and no busy slot in this type. A
 * public grid marking which slots are taken publishes a minute-by-minute
 * occupancy map of a named person at a named place, to anyone, free to scrape.
 * Returning only what is bookable discloses strictly less and answers the same
 * question.
 */
public record AvailableSlot(Instant startsAt, Instant endsAt) {
}
