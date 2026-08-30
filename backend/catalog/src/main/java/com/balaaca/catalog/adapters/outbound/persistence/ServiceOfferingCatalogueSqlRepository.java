package com.balaaca.catalog.adapters.outbound.persistence;

import com.balaaca.catalog.domain.DuplicateServiceNameException;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.OfferingDefinition;
import com.balaaca.catalog.ports.inbound.ManageServiceOfferingsUseCase.ServiceOffering;
import com.balaaca.catalog.ports.outbound.ServiceOfferingRepository;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.sql.SQLException;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The catalogue in SQL.
 *
 * <p>No provider predicate on the reads and the update: RLS supplies it, so
 * another provider's service is invisible rather than forbidden, and a row that
 * is not the caller's produces the same "not found" as one that never existed.
 * The insert is the exception - a native insert bypasses any tenant filter, so
 * provider_id comes from TenantContext and the policy's WITH CHECK is the
 * backstop if it is ever wrong.
 */
@ApplicationScoped
public class ServiceOfferingCatalogueSqlRepository implements ServiceOfferingRepository {

    private static final String UNIQUE_VIOLATION = "23505";

    private static final String COLUMNS = """
            id, name, description, duration_minutes, buffer_before_minutes,
            buffer_after_minutes, price_amount_minor, price_currency,
            price_visible, sort_order, active
            """;

    private final EntityManager em;
    private final TenantContext tenantContext;

    public ServiceOfferingCatalogueSqlRepository(EntityManager em, TenantContext tenantContext) {
        this.em = em;
        this.tenantContext = tenantContext;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<ServiceOffering> page(Optional<Boolean> active, Optional<ServiceOfferingId> after,
                                      int limit) {
        // Ordered by sort_order then id: the provider's own arrangement first,
        // and a stable tie-break so a page boundary lands in the same place
        // twice. The cursor compares the pair for the same reason.
        List<Object[]> rows = em.createNativeQuery("""
                SELECT %s FROM service_offerings
                 WHERE (CAST(:active AS boolean) IS NULL OR active = CAST(:active AS boolean))
                   AND (CAST(:after AS uuid) IS NULL
                        OR (sort_order, id) > (
                            SELECT sort_order, id FROM service_offerings
                             WHERE id = CAST(:after AS uuid)))
                 ORDER BY sort_order, id
                 LIMIT :limit
                """.formatted(COLUMNS))
                .setParameter("active", active.orElse(null))
                .setParameter("after", after.map(ServiceOfferingId::value).orElse(null))
                .setParameter("limit", limit + 1)
                .getResultList();

        return rows.stream().map(ServiceOfferingCatalogueSqlRepository::toOffering).toList();
    }

    @Override
    @SuppressWarnings("unchecked")
    public ServiceOffering insert(ServiceOfferingId id, OfferingDefinition d) {
        UUID providerId = tenantContext.require().value();
        try {
            Object[] row = (Object[]) em.createNativeQuery("""
                    INSERT INTO service_offerings (
                        id, provider_id, name, description, duration_minutes,
                        buffer_before_minutes, buffer_after_minutes,
                        price_amount_minor, price_currency, price_visible,
                        sort_order, active)
                    VALUES (:id, :providerId, :name, :description, :duration,
                            :bufferBefore, :bufferAfter, :priceMinor, :currency,
                            :priceVisible, :sortOrder, :active)
                    RETURNING %s
                    """.formatted(COLUMNS))
                    .setParameter("id", id.value())
                    .setParameter("providerId", providerId)
                    .setParameter("name", d.name())
                    .setParameter("description", d.description().orElse(null))
                    .setParameter("duration", (int) d.duration().toMinutes())
                    .setParameter("bufferBefore", (int) d.bufferBefore().toMinutes())
                    .setParameter("bufferAfter", (int) d.bufferAfter().toMinutes())
                    .setParameter("priceMinor", d.price().amountMinor())
                    .setParameter("currency", d.price().currency().name())
                    .setParameter("priceVisible", d.priceVisible())
                    .setParameter("sortOrder", d.sortOrder())
                    .setParameter("active", d.active())
                    .getSingleResult();
            return toOffering(row);
        } catch (PersistenceException e) {
            throw translate(e, d.name());
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<ServiceOffering> replace(ServiceOfferingId id, OfferingDefinition d) {
        try {
            List<Object[]> rows = em.createNativeQuery("""
                    UPDATE service_offerings
                       SET name = :name,
                           description = :description,
                           duration_minutes = :duration,
                           buffer_before_minutes = :bufferBefore,
                           buffer_after_minutes = :bufferAfter,
                           price_amount_minor = :priceMinor,
                           price_currency = :currency,
                           price_visible = :priceVisible,
                           sort_order = :sortOrder,
                           active = :active,
                           updated_at = now()
                     WHERE id = :id
                    RETURNING %s
                    """.formatted(COLUMNS))
                    .setParameter("id", id.value())
                    .setParameter("name", d.name())
                    .setParameter("description", d.description().orElse(null))
                    .setParameter("duration", (int) d.duration().toMinutes())
                    .setParameter("bufferBefore", (int) d.bufferBefore().toMinutes())
                    .setParameter("bufferAfter", (int) d.bufferAfter().toMinutes())
                    .setParameter("priceMinor", d.price().amountMinor())
                    .setParameter("currency", d.price().currency().name())
                    .setParameter("priceVisible", d.priceVisible())
                    .setParameter("sortOrder", d.sortOrder())
                    .setParameter("active", d.active())
                    .getResultList();

            return rows.isEmpty() ? Optional.empty() : Optional.of(toOffering(rows.get(0)));
        } catch (PersistenceException e) {
            throw translate(e, d.name());
        }
    }

    /**
     * The partial unique index on active rows is what forbids two live services
     * with the same name. Reading its SQLSTATE rather than pre-checking: two
     * callers both pass a check-then-insert, and only one passes the index.
     */
    private static RuntimeException translate(PersistenceException e, String name) {
        for (Throwable t = e; t != null && t.getCause() != t; t = t.getCause()) {
            if (t instanceof SQLException sql && UNIQUE_VIOLATION.equals(sql.getSQLState())) {
                return new DuplicateServiceNameException(name);
            }
        }
        return e;
    }

    private static ServiceOffering toOffering(Object[] r) {
        return new ServiceOffering(
                ServiceOfferingId.of((UUID) r[0]),
                new OfferingDefinition(
                        (String) r[1],
                        Optional.ofNullable((String) r[2]),
                        Duration.ofMinutes(((Number) r[3]).longValue()),
                        Duration.ofMinutes(((Number) r[4]).longValue()),
                        Duration.ofMinutes(((Number) r[5]).longValue()),
                        Money.ofMinor(((Number) r[6]).longValue(), Currency.of((String) r[7])),
                        (Boolean) r[8],
                        ((Number) r[9]).intValue(),
                        (Boolean) r[10]));
    }
}
