package com.balaaca.catalog.ports.inbound;

import com.balaaca.sharedkernel.ids.ServiceOfferingId;

/** What catalog publishes to the rest of the core. An in-process call, never a hop. */
public interface LookupServiceOfferingUseCase {

    /**
     * @throws com.balaaca.catalog.domain.ServiceOfferingNotFoundException when
     *         the offering does not exist, is inactive, or belongs to another
     *         provider - the three are indistinguishable by design
     */
    BookableOffering requireBookable(ServiceOfferingId id);
}
