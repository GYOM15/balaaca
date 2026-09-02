package com.balaaca.catalog.adapters.outbound.persistence;

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

    /**
     * A text[] comes back as one of two things and the shape is not ours to
     * choose: the driver's own java.sql.Array, or an already-unwrapped Java
     * array, depending on how Hibernate resolved the column. Both are handled
     * rather than one being assumed - assuming cost a ClassCastException on the
     * public page, which is the one page a stranger sees.
     *
     * <p>An empty array is an empty list and not a null: a service with no
     * photograph is ordinary, and most of them are.
     */
    private static List<String> photos(Object column) {
        if (column == null) {
            return List.of();
        }
        Object raw = column;
        if (raw instanceof java.sql.Array array) {
            try {
                raw = array.getArray();
            } catch (java.sql.SQLException e) {
                throw new IllegalStateException("could not read the photograph names", e);
            }
        }
        if (raw instanceof Object[] names) {
            return java.util.Arrays.stream(names)
                    .filter(java.util.Objects::nonNull)
                    .map(String::valueOf)
                    .toList();
        }
        return List.of(String.valueOf(raw));
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public List<PublishedService> published() {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, name, description, duration_minutes,
                       CASE WHEN price_visible THEN price_amount_minor END,
                       CASE WHEN price_visible THEN price_currency END,
                       turnaround_hours,
                       offers_on_site, offers_drop_off, offers_at_customer,
                       -- One statement rather than one query per service: a
                       -- catalogue of twelve would otherwise be thirteen round
                       -- trips to draw one page.
                       COALESCE((SELECT array_agg(ph.stored_name ORDER BY ph.sort_order)
                                   FROM service_photos ph
                                  WHERE ph.service_offering_id = service_offerings.id),
                                '{}')
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
                OfferedModes.of((Boolean) r[7], (Boolean) r[8], (Boolean) r[9]),
                photos(r[10]),
                Optional.ofNullable(r[4]).map(amount -> Money.ofMinor(
                        ((Number) amount).longValue(),
                        Currency.of((String) r[5]))))).toList();
    }
}
