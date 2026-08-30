package com.balaaca.catalog.application;

import com.balaaca.catalog.domain.ServiceOfferingNotFoundException;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase;
import com.balaaca.catalog.ports.outbound.ServiceOfferingRepository;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The catalogue, read and written.
 *
 * <p>Transactional even for the read: the tenant reaches PostgreSQL as a SET
 * LOCAL, discarded outside a transaction, and the query would then run with no
 * tenant bound - returning nothing, which reads as an empty catalogue rather
 * than as a failure.
 */
@ApplicationScoped
public class ManageServiceOfferingsService implements ManageServiceOfferingsUseCase {

    private final ServiceOfferingRepository offerings;

    public ManageServiceOfferingsService(ServiceOfferingRepository offerings) {
        this.offerings = offerings;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public OfferingPage list(Optional<Boolean> active, Optional<ServiceOfferingId> after, int limit) {
        List<ServiceOffering> fetched = offerings.page(active, after, limit);

        boolean more = fetched.size() > limit;
        List<ServiceOffering> entries = more ? fetched.subList(0, limit) : fetched;

        return new OfferingPage(List.copyOf(entries),
                more ? Optional.of(entries.get(entries.size() - 1).id()) : Optional.empty());
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ServiceOffering create(OfferingDefinition definition) {
        return offerings.insert(ServiceOfferingId.of(UUID.randomUUID()), definition);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ServiceOffering replace(ServiceOfferingId id, OfferingDefinition definition) {
        return offerings.replace(id, definition)
                .orElseThrow(() -> new ServiceOfferingNotFoundException(id.value()));
    }
}
