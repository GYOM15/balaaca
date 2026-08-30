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
     * @param duration what an appointment occupies
     * @param bufferBefore the quiet either side of it - a chair to be swept
     */
    record OfferingDefinition(String name,
                              Optional<String> description,
                              Duration duration,
                              Duration bufferBefore,
                              Duration bufferAfter,
                              Money price,
                              boolean priceVisible,
                              int sortOrder,
                              boolean active) {
    }

    /** The provider's own view: it carries the price whether or not the public page does. */
    record ServiceOffering(ServiceOfferingId id, OfferingDefinition definition) {
    }

    record OfferingPage(List<ServiceOffering> entries, Optional<ServiceOfferingId> next) {
    }
}
