package com.balaaca.catalog.ports.outbound;

import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.OfferingDefinition;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.ServiceOffering;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import java.util.List;
import java.util.Optional;

/** Writes and reads the caller's catalogue. */
public interface ServiceOfferingRepository {

    /**
     * One more than asked for, so the caller can tell a full page from the last
     * one without a second query.
     */
    List<ServiceOffering> page(Optional<Boolean> active, Optional<ServiceOfferingId> after,
                               int limit);

    ServiceOffering insert(ServiceOfferingId id, OfferingDefinition definition);

    /**
     * @return the service as it now stands, or empty when no row was the
     *         caller's - which RLS makes the same answer as no row at all
     */
    Optional<ServiceOffering> replace(ServiceOfferingId id, OfferingDefinition definition);
}
