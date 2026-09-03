package com.balaaca.catalog.ports.inbound;

import com.balaaca.catalog.domain.IncompatibleServiceShapeException;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The provider's own catalogue.
 *
 * <p>No provider identifier anywhere: the tenant is ambient, and RLS is what
 * makes another provider's service invisible rather than forbidden.
 */
public interface ManageServiceOfferingsUseCase {

    OfferingPage list(Optional<Boolean> active, Optional<ServiceOfferingId> after, int limit);

    ServiceOffering create(OfferingDefinition definition);

    /** The whole representation. A retired service is {@code active = false}, never deleted. */
    ServiceOffering replace(ServiceOfferingId id, OfferingDefinition definition);

    /**
     * What a provider says about a service.
     *
     * @param duration what an appointment occupies. On a drop-off offering this
     *                 is the HANDOVER at the counter, not the work - the work
     *                 does not occupy anybody
     * @param bufferBefore the quiet either side of it - a chair to be swept
     * @param turnaround the delay announced for {@code DROP_OFF}, and present
     *                   exactly when that mode is offered. It was the
     *                   discriminant before V044 and is now a promise about one
     *                   of possibly several modes: a service that is also
     *                   {@code ON_SITE} carries no promise for the customer who
     *                   stayed in the chair
     * @param fulfilments every way this one service can be obtained. One price
     *                    and one duration whichever the customer picks - a
     *                    surcharge for travelling is a pricing model nobody has
     *                    decided, and a provider who genuinely charges more to
     *                    travel still publishes two services
     */
    record OfferingDefinition(String name,
                              Optional<String> description,
                              Duration duration,
                              Duration bufferBefore,
                              Duration bufferAfter,
                              Optional<Duration> turnaround,
                              Set<Fulfilment> fulfilments,
                              Money price,
                              boolean priceVisible,
                              int sortOrder,
                              boolean active) {

        public OfferingDefinition {
            if (fulfilments.isEmpty()) {
                throw IncompatibleServiceShapeException.offeredNoWay();
            }
            // An EnumSet, so iteration is declaration order wherever this is
            // read - a Set.copyOf would leave the published array in whatever
            // order a hash happened to produce.
            fulfilments = Collections.unmodifiableSet(EnumSet.copyOf(fulfilments));
            // The pairing the table states as an equality between two columns.
            // Stated here too because the message matters: a constraint name
            // tells a provider nothing.
            if (turnaround.isPresent() != fulfilments.contains(Fulfilment.DROP_OFF)) {
                throw turnaround.isPresent()
                        ? IncompatibleServiceShapeException.turnaroundWithoutDropOff()
                        : IncompatibleServiceShapeException.dropOffWithoutTurnaround();
            }
            turnaround.ifPresent(t -> {
                if (t.isNegative() || t.isZero() || t.toHours() > 2160) {
                    throw new IllegalArgumentException(
                            "a turnaround is between one hour and ninety days");
                }
            });
        }

        /** The one value the deprecated singular field on both views carries. */
        public Fulfilment primaryFulfilment() {
            return Fulfilment.primaryOf(fulfilments);
        }
    }

    /** The provider's own view: it carries the price whether or not the public page does. */
    record ServiceOffering(ServiceOfferingId id, OfferingDefinition definition) {
    }

    record OfferingPage(List<ServiceOffering> entries, Optional<ServiceOfferingId> next) {
    }
}
