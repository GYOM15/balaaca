package com.balaaca.catalog.ports.inbound;

import com.balaaca.catalog.domain.IncompatibleServiceShapeException;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * How the work reaches the customer.
 *
 * <p>In ports.inbound and not in the domain, because it is not catalog's own
 * business: an offering publishes a SET of these, {@code booking} freezes the
 * customer's choice among them onto the appointment, and the edge renders both.
 * A published vocabulary word belongs where the rest of the published
 * vocabulary lives.
 *
 * <p>It replaces {@code ServiceLocation}, which could name one shape at a time
 * and so made a braider who works in her salon and at her customers' houses
 * publish the same service twice - two prices to keep in step and two entries a
 * customer had to choose between for no reason.
 */
public enum Fulfilment {

    /** The customer sits down and waits, and the duration is how long. */
    ON_SITE,

    /** They hand the work over and come back. The offering announces a turnaround. */
    DROP_OFF,

    /** The provider travels. The appointment then carries where to. */
    AT_CUSTOMER;

    /**
     * The one value that has to stand for a service offering several.
     *
     * <p>Declaration order, so every caller answers the deprecated singular
     * field the same way and the answer does not depend on how a set happened to
     * be built.
     */
    public static Fulfilment primaryOf(Set<Fulfilment> offered) {
        return Arrays.stream(values()).filter(offered::contains).findFirst()
                .orElseThrow(IncompatibleServiceShapeException::offeredNoWay);
    }

    /**
     * What a request published, whichever of the two spellings it used.
     *
     * <p>Here rather than at the edge because every refusal below is a rule
     * about a service, and a rule stated at the edge is a rule the next caller
     * gets to skip.
     *
     * @param stated the modern set. Empty when the request did not use it - the
     *               generated model initialises the list, so an omitted array
     *               and an empty one are the same value and cannot be told apart
     * @param travels the deprecated {@code location}, empty when it was not sent
     * @param handedOver whether a turnaround was announced. On the old spelling
     *                   its presence is what made an offering a drop-off
     */
    public static Set<Fulfilment> published(List<Fulfilment> stated,
                                            Optional<Boolean> travels,
                                            boolean handedOver) {
        boolean modern = stated != null && !stated.isEmpty();
        if (modern && travels.isPresent()) {
            throw IncompatibleServiceShapeException.bothSpellings();
        }
        if (modern) {
            Set<Fulfilment> set = EnumSet.copyOf(stated);
            // A set silently absorbs a repeat, so the request would be accepted
            // as something other than what it said. The contract admits each
            // value once and this is where that is true.
            if (set.size() != stated.size()) {
                throw IncompatibleServiceShapeException.repeatedMode();
            }
            return set;
        }
        if (travels.orElse(false)) {
            return EnumSet.of(AT_CUSTOMER);
        }
        return EnumSet.of(handedOver ? DROP_OFF : ON_SITE);
    }
}
