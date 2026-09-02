package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase.CustomerDetail;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase.CustomerSummary;
import com.balaaca.booking.ports.inbound.ListCustomersUseCase.Visit;
import com.balaaca.booking.ports.outbound.CustomerRepository;
import com.balaaca.sharedkernel.ids.CustomerId;
import com.balaaca.sharedkernel.phone.PhoneNumber;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The address book, in SQL.
 *
 * <p>No provider predicate anywhere: RLS supplies it, and {@code customers}
 * carries only a tenant policy - there is no public read on this table and there
 * must never be one. A directory that hands out every provider's customer list
 * is a marketing database with a booking form attached.
 */
@ApplicationScoped
public class CustomerSqlRepository implements CustomerRepository {

    private final EntityManager em;

    public CustomerSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<CustomerSummary> page(Optional<String> contains,
                                      Optional<CustomerId> after, int limit) {
        // Ordered by name then id, like the catalogue: a salon reads an address
        // book alphabetically, and a stable tie-break is what lets the cursor be
        // the position the caller already read.
        //
        // The aggregate is a lateral rather than a GROUP BY over a join, so a
        // customer with no appointment still appears - which happens, because a
        // booking that failed after the customer upsert leaves exactly that.
        List<Object[]> rows = em.createNativeQuery("""
                SELECT c.id, c.full_name, c.phone_e164, c.email, v.visits, v.last_visit
                  FROM customers c
                  LEFT JOIN LATERAL (
                        SELECT count(*)::int AS visits, max(a.starts_at) AS last_visit
                          FROM appointments a WHERE a.customer_id = c.id) v ON true
                 WHERE (CAST(:contains AS varchar) IS NULL
                        OR c.full_name ILIKE '%' || CAST(:contains AS varchar) || '%'
                        OR c.phone_e164 LIKE '%' || CAST(:contains AS varchar) || '%')
                   AND (CAST(:after AS uuid) IS NULL
                        OR (c.full_name, c.id) > (SELECT full_name, id FROM customers
                                                   WHERE id = CAST(:after AS uuid)))
                 ORDER BY c.full_name, c.id
                 LIMIT :limit
                """)
                .setParameter("contains", contains.orElse(null))
                .setParameter("after", after.map(CustomerId::value).orElse(null))
                .setParameter("limit", limit + 1)
                .getResultList();

        return rows.stream().map(CustomerSqlRepository::toSummary).toList();
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<CustomerDetail> detail(CustomerId id) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT c.id, c.full_name, c.phone_e164, c.email, c.notes,
                       c.blocked, v.visits, v.last_visit
                  FROM customers c
                  LEFT JOIN LATERAL (
                        SELECT count(*)::int AS visits, max(a.starts_at) AS last_visit
                          FROM appointments a WHERE a.customer_id = c.id) v ON true
                 WHERE c.id = :id
                """).setParameter("id", id.value()).getResultList();

        return rows.stream().findFirst().map(r -> new CustomerDetail(
                CustomerId.of((UUID) r[0]),
                contact(r[1], r[2], r[3]),
                Optional.ofNullable((String) r[4]).filter(n -> !n.isBlank()),
                (Boolean) r[5],
                ((Number) r[6]).intValue(),
                Optional.ofNullable(r[7]).map(CustomerSqlRepository::instant),
                history(id)));
    }

    /**
     * Most recent first, and capped.
     *
     * <p>A salon opening a regular's card wants the last few visits, not four
     * years of them, and an uncapped history would put the whole of a busy
     * customer's life on one screen. Fifty is more than anybody reads and small
     * enough to never matter.
     */
    @SuppressWarnings("unchecked")
    private List<Visit> history(CustomerId id) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT a.starts_at, a.service_name, a.status, s.display_name
                  FROM appointments a
                  JOIN provider_staff s
                    ON s.provider_id = a.provider_id AND s.id = a.staff_id
                 WHERE a.customer_id = :id
                 ORDER BY a.starts_at DESC
                 LIMIT 50
                """).setParameter("id", id.value()).getResultList();

        return rows.stream()
                .map(r -> new Visit(instant(r[0]), (String) r[1], (String) r[2],
                                    (String) r[3]))
                .toList();
    }

    @Override
    public boolean replaceNotes(CustomerId id, Optional<String> notes) {
        // Blank clears it rather than storing whitespace, the same rule V034
        // applied to a quartier: an empty note is no note, and a note of three
        // spaces renders as a card that looks annotated and says nothing.
        return em.createNativeQuery("""
                UPDATE customers
                   SET notes = nullif(btrim(CAST(:notes AS text)), ''),
                       updated_at = now()
                 WHERE id = :id
                """)
                .setParameter("notes", notes.orElse(null))
                .setParameter("id", id.value())
                .executeUpdate() > 0;
    }

    @Override
    public boolean setBlocked(CustomerId id, boolean blocked) {
        // No provider predicate and no membership check: RLS removed every other
        // salon's row from this statement's reach before it ran, so a customer
        // id belonging elsewhere updates nothing and the caller is told the same
        // thing an unknown id is told.
        return em.createNativeQuery("""
                UPDATE customers
                   SET blocked = CAST(:blocked AS boolean),
                       updated_at = now()
                 WHERE id = :id
                """)
                .setParameter("blocked", blocked)
                .setParameter("id", id.value())
                .executeUpdate() > 0;
    }

    private static CustomerSummary toSummary(Object[] r) {
        return new CustomerSummary(
                CustomerId.of((UUID) r[0]),
                contact(r[1], r[2], r[3]),
                ((Number) r[4]).intValue(),
                Optional.ofNullable(r[5]).map(CustomerSqlRepository::instant));
    }

    private static CustomerContact contact(Object name, Object phone, Object email) {
        return new CustomerContact((String) name, new PhoneNumber((String) phone),
                                   Optional.ofNullable((String) email));
    }

    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime o) {
            return o.toInstant();
        }
        if (value instanceof Instant i) {
            return i;
        }
        return ((java.sql.Timestamp) value).toInstant();
    }
}
