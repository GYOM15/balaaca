package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.ports.outbound.CustomerBookingRepository;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The customer's own booking, in SQL.
 *
 * <p>No provider predicate anywhere: the tenant was bound from this very
 * reference before the read, so RLS confines all three tables to it. A reference
 * belonging to another provider is not filtered out here - the binding never
 * happened and the request stopped earlier.
 */
@ApplicationScoped
public class CustomerBookingSqlRepository implements CustomerBookingRepository {

    private final EntityManager em;

    public CustomerBookingSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<BookingSnapshot> byReference(String reference) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT a.id, a.public_reference, p.slug, p.business_name,
                       a.service_name, s.display_name, a.starts_at, a.ends_at,
                       a.status, a.customer_price_amount_minor,
                       a.customer_price_currency, p.timezone,
                       a.ready_by, a.ready_at,
                       p.cancellation_deadline_minutes
                  FROM appointments a
                  JOIN providers p ON p.id = a.provider_id
                  JOIN provider_staff s
                    ON s.provider_id = a.provider_id AND s.id = a.staff_id
                 WHERE a.public_reference = :reference
                """).setParameter("reference", reference).getResultList();

        return rows.stream().findFirst().map(r -> new BookingSnapshot(
                AppointmentId.of((UUID) r[0]),
                (String) r[1], (String) r[2], (String) r[3], (String) r[4], (String) r[5],
                instant(r[6]), instant(r[7]),
                (String) r[8],
                Money.ofMinor(((Number) r[9]).longValue(), Currency.of((String) r[10])),
                (String) r[11],
                Optional.ofNullable(r[12]).map(CustomerBookingSqlRepository::instant),
                Optional.ofNullable(r[13]).map(CustomerBookingSqlRepository::instant),
                Duration.ofMinutes(((Number) r[14]).longValue())));
    }
    /**
     * The type a timestamptz comes back as depends on the driver and its
     * configuration, which ADR-0008 names as one of the costs of native SQL and
     * which has already produced one ClassCastException in this codebase. Three
     * shapes, one answer.
     */
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
