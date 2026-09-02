package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;

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
         * The delay attached to {@code DROP_OFF}, empty when the service is not
         * offered that way. Booking freezes it onto the appointment - and only
         * onto a booking that IS a drop-off - so re-announcing a shorter delay
         * tomorrow never rewrites what was promised yesterday.
         */
        Optional<Duration> turnaround,
        /**
         * Every way this service can be had, and therefore the choice the
         * booking form has to offer. Never empty: a service obtainable no way
         * at all is a row with no meaning, and a CHECK refuses it.
         *
         * <p>Which one a customer picked is frozen onto the appointment rather
         * than re-read from here: a braider who stops travelling must not turn
         * Thursday's house call into a chair in her salon.
         */
        Set<Fulfilment> fulfilments,
        Money price) {
}
