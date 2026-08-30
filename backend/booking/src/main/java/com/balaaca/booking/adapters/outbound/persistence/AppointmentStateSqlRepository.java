package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.outbound.AppointmentStateRepository;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import com.balaaca.sharedkernel.phone.PhoneNumber;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The state machine, as statements.
 *
 * <p>No provider predicate: RLS supplies it, and that is what makes another
 * provider's appointment answer exactly like one that does not exist - the
 * UPDATE matches nothing, and so does the status read that follows.
 */
@ApplicationScoped
public class AppointmentStateSqlRepository implements AppointmentStateRepository {

    private final EntityManager em;

    public AppointmentStateSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AgendaEntry> cancel(AppointmentId id, Optional<String> reason, Instant at) {
        // The accepted states are in the WHERE clause, not in an if above it.
        // Two simultaneous cancellations then produce one affected row and one
        // zero, instead of both reading PENDING and both writing.
        //
        // version is incremented although nothing compares it: the contract
        // carries no version for a caller to state, so there is nothing to
        // check it against. The column stays truthful for the day an ETag
        // gives one a way to be sent.
        List<Object[]> rows = em.createNativeQuery("""
                UPDATE appointments
                   SET status = 'CANCELLED',
                       cancellation_reason = :reason,
                       cancelled_by = 'PROVIDER',
                       cancelled_at = :at,
                       version = version + 1,
                       updated_at = now()
                 WHERE id = :id
                   AND status IN ('PENDING','CONFIRMED')
                RETURNING id, starts_at, ends_at, status, service_name,
                          customer_price_amount_minor, customer_price_currency,
                          customer_id
                """)
                .setParameter("id", id.value())
                .setParameter("reason", reason.orElse(null))
                .setParameter("at", Timestamp.from(at))
                .getResultList();

        return rows.isEmpty() ? Optional.empty() : Optional.of(toEntry(rows.get(0)));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AppointmentStatus> statusOf(AppointmentId id) {
        List<String> rows = em.createNativeQuery(
                "SELECT status FROM appointments WHERE id = :id")
                .setParameter("id", id.value())
                .getResultList();
        return rows.stream().findFirst().map(AppointmentStatus::valueOf);
    }

    /**
     * The customer is read separately rather than joined into the UPDATE:
     * PostgreSQL's RETURNING sees only the row it wrote, so a joined column
     * would need a second statement anyway.
     */
    @SuppressWarnings("unchecked")
    private AgendaEntry toEntry(Object[] r) {
        Object[] c = (Object[]) em.createNativeQuery(
                "SELECT full_name, phone_e164, email FROM customers WHERE id = :id")
                .setParameter("id", r[7])
                .getSingleResult();

        return new AgendaEntry(
                AppointmentId.of((UUID) r[0]),
                instant(r[1]),
                instant(r[2]),
                AppointmentStatus.valueOf((String) r[3]),
                (String) r[4],
                Money.ofMinor(((Number) r[5]).longValue(), Currency.of((String) r[6])),
                new CustomerContact((String) c[0], new PhoneNumber((String) c[1]),
                                    Optional.ofNullable((String) c[2])));
    }

    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime o) {
            return o.toInstant();
        }
        if (value instanceof Instant i) {
            return i;
        }
        return ((Timestamp) value).toInstant();
    }
}
