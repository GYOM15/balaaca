package com.balaaca.catalog.adapters.outbound.persistence;

import com.balaaca.catalog.ports.inbound.ServiceLocation;
import com.balaaca.catalog.ports.inbound.PublishedCatalogueUseCase;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The public catalogue, in SQL.
 *
 * <p>No provider predicate: RLS supplies it, and the public page binds its
 * tenant from a published slug before calling. Transactional because that
 * binding is a SET LOCAL, discarded outside a transaction - a read without one
 * returns nothing, which reads as a salon that offers no services.
 *
 * <p>price_visible is applied here, in the SELECT's own projection, so the
 * amount never leaves the database for a service that hides it.
 */
@ApplicationScoped
public class PublishedCatalogueSqlRepository implements PublishedCatalogueUseCase {

    private final EntityManager em;

    public PublishedCatalogueSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public List<PublishedService> published() {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, name, description, duration_minutes,
                       CASE WHEN price_visible THEN price_amount_minor END,
                       CASE WHEN price_visible THEN price_currency END,
                       turnaround_hours, location_kind
                  FROM service_offerings
                 WHERE active
                 ORDER BY sort_order, name
                """).getResultList();

        return rows.stream().map(r -> new PublishedService(
                ServiceOfferingId.of((UUID) r[0]),
                (String) r[1],
                Optional.ofNullable((String) r[2]),
                Duration.ofMinutes(((Number) r[3]).longValue()),
                Optional.ofNullable((Number) r[6]).map(h -> Duration.ofHours(h.longValue())),
                ServiceLocation.valueOf((String) r[7]),
                Optional.ofNullable(r[4]).map(amount -> Money.ofMinor(
                        ((Number) amount).longValue(),
                        Currency.of((String) r[5]))))).toList();
    }
}
