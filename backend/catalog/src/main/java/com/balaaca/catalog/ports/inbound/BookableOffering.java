package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;
import java.util.Optional;

/**
 * What catalog publishes about an offering to the rest of the core.
 *
 * <p>Deliberately not the {@code ServiceOffering} aggregate: publishing the
 * aggregate would let another context depend on catalog's domain, and every
 * later change to it would ripple outward. This carries exactly what a caller
 * needs to book, and nothing catalog might want to reshape.
 */
public record BookableOffering(
        ServiceOfferingId id,
        String name,
        Duration duration,
        Duration bufferBefore,
        Duration bufferAfter,
        /**
         * Empty when the customer waits for the work; present when they hand it
         * over. Booking freezes it onto the appointment and derives the promise
         * from it, so re-announcing a shorter delay tomorrow never rewrites what
         * was promised yesterday.
         */
        Optional<Duration> turnaround,
        Money price) {
}
