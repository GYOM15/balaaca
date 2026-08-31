package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

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
     * @param turnaround empty for a service performed while the customer waits;
     *                   present for one they hand over and come back for. Its
     *                   PRESENCE is what makes an offering a drop-off: two
     *                   fields, a flag and a delay, could disagree, and one of
     *                   the two disagreements - a drop-off with no delay
     *                   announced - is a promise nobody made
     */
    record OfferingDefinition(String name,
                              Optional<String> description,
                              Duration duration,
                              Duration bufferBefore,
                              Duration bufferAfter,
                              Optional<Duration> turnaround,
                              Money price,
                              boolean priceVisible,
                              int sortOrder,
                              boolean active) {

        public OfferingDefinition {
            turnaround.ifPresent(t -> {
                // Mirrors the column's CHECK. Stated here too because the
                // message matters: a constraint name tells a provider nothing.
                if (t.isNegative() || t.isZero() || t.toHours() > 2160) {
                    throw new IllegalArgumentException(
                            "a turnaround is between one hour and ninety days");
                }
            });
        }

        /** What the customer does: sit down, or hand it over. */
        public boolean isDropOff() {
            return turnaround.isPresent();
        }
    }

    /** The provider's own view: it carries the price whether or not the public page does. */
    record ServiceOffering(ServiceOfferingId id, OfferingDefinition definition) {
    }

    record OfferingPage(List<ServiceOffering> entries, Optional<ServiceOfferingId> next) {
    }
}
