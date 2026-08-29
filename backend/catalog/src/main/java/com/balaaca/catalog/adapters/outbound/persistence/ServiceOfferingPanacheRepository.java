package com.balaaca.catalog.adapters.outbound.persistence;

import com.balaaca.catalog.domain.ServiceOfferingNotFoundException;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.catalog.ports.inbound.LookupServiceOfferingUseCase;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class ServiceOfferingPanacheRepository implements LookupServiceOfferingUseCase {

    private final EntityManager em;

    public ServiceOfferingPanacheRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public BookableOffering requireBookable(ServiceOfferingId id) {
        // No provider_id predicate: RLS supplies it. Adding one by hand would
        // be a second place to forget it, and the database is the backstop that
        // holds when application code does.
        List<Object[]> rows = em.createNativeQuery("""
                SELECT name, duration_minutes, buffer_before_minutes, buffer_after_minutes,
                       price_amount_minor, price_currency, active
                  FROM service_offerings
                 WHERE id = :id AND active
                """).setParameter("id", id.value()).getResultList();

        if (rows.isEmpty()) {
            throw new ServiceOfferingNotFoundException(id.value());
        }
        Object[] r = rows.get(0);
        return new BookableOffering(
                id,
                (String) r[0],
                Duration.ofMinutes(((Number) r[1]).longValue()),
                Duration.ofMinutes(((Number) r[2]).longValue()),
                Duration.ofMinutes(((Number) r[3]).longValue()),
                Money.ofMinor(((Number) r[4]).longValue(), Currency.of((String) r[5])));
    }
}
