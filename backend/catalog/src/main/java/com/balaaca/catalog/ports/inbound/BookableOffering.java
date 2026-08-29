package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;

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
        Money price) {
}
