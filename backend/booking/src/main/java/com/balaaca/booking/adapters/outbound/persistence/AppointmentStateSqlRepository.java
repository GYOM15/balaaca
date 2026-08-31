package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingExceptions.SlotUnavailableException;
import com.balaaca.booking.domain.BookingExceptions.TransientBookingConflictException;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaEntry;
import com.balaaca.booking.ports.outbound.AppointmentStateRepository;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.sharedkernel.money.Currency;
import com.balaaca.sharedkernel.money.Money;
import com.balaaca.sharedkernel.phone.PhoneNumber;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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

    private static final String EXCLUSION_VIOLATION = "23P01";
    private static final String DEADLOCK_DETECTED = "40P01";

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
                          customer_id, customer_note
                """)
                .setParameter("id", id.value())
                .setParameter("reason", reason.orElse(null))
                .setParameter("at", Timestamp.from(at))
                .getResultList();

        return rows.isEmpty() ? Optional.empty() : Optional.of(toEntry(rows.get(0)));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AgendaEntry> reschedule(AppointmentId id, BookedSlot slot, Instant at) {
        // The four time columns move together, and ck_appointments_block_derived
        // checks that they still agree: the database re-derives the block window
        // from the buffers rather than trusting this statement to have done it.
        //
        // A 23P01 from the exclusion constraint is translated here, as it is on
        // the insert path: the transaction is already rollback-only when it
        // arrives, so nothing further may touch the database - which is exactly
        // why the translation cannot be deferred to a caller that would want to
        // ask the database a follow-up question.
        List<Object[]> rows;
        try {
            rows = em.createNativeQuery("""
                UPDATE appointments
                   SET starts_at = :startsAt,
                       ends_at = :endsAt,
                       blocked_from = :blockedFrom,
                       blocked_until = :blockedUntil,
                       version = version + 1,
                       updated_at = :at
                 WHERE id = :id
                   AND status IN ('PENDING','CONFIRMED')
                RETURNING id, starts_at, ends_at, status, service_name,
                          customer_price_amount_minor, customer_price_currency,
                          customer_id, customer_note
                """)
                .setParameter("id", id.value())
                .setParameter("startsAt", Timestamp.from(slot.startsAt()))
                .setParameter("endsAt", Timestamp.from(slot.endsAt()))
                .setParameter("blockedFrom", Timestamp.from(slot.blockedFrom()))
                .setParameter("blockedUntil", Timestamp.from(slot.blockedUntil()))
                .setParameter("at", Timestamp.from(at))
                .getResultList();
        } catch (PersistenceException e) {
            String state = sqlState(e);
            if (EXCLUSION_VIOLATION.equals(state)) {
                // The slot is taken at the new time. The same answer a first
                // booking gets, and it never names who has it.
                throw new SlotUnavailableException(slot.startsAt(), null);
            }
            if (DEADLOCK_DETECTED.equals(state)) {
                // Measured on the insert path: at two, five and ten racers the
                // loser's SQLSTATE is 40P01, not 23P01. This statement contends
                // on the same index, and only the insert side translated it - so
                // a provider dragging an appointment while a customer booked the
                // same window was answered 500, with the appointment silently
                // still at its old time. A deadlock says this transaction lost
                // and nothing about the slot, so it is retried, not reported.
                throw new TransientBookingConflictException(e);
            }
            throw e;
        }

        return rows.isEmpty() ? Optional.empty() : Optional.of(toEntry(rows.get(0)));
    }

    /** The cause chain, because the driver's exception is wrapped by the time it arrives. */
    private static String sqlState(Throwable e) {
        for (Throwable t = e; t != null && t.getCause() != t; t = t.getCause()) {
            if (t instanceof SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AgendaEntry> transition(AppointmentId id, Set<AppointmentStatus> from,
                                            AppointmentStatus to, Instant at) {
        // The accepted states are bound as an array rather than interpolated:
        // the set comes from the application layer, and a set that reached SQL
        // as text would be one place where it could stop being a set.
        String[] accepted = from.stream().map(Enum::name).toArray(String[]::new);

        List<Object[]> rows = em.createNativeQuery("""
                UPDATE appointments
                   SET status = CAST(:to AS varchar),
                       version = version + 1,
                       updated_at = :at
                 WHERE id = :id
                   AND status = ANY(CAST(:accepted AS varchar[]))
                RETURNING id, starts_at, ends_at, status, service_name,
                          customer_price_amount_minor, customer_price_currency,
                          customer_id, customer_note
                """)
                .setParameter("id", id.value())
                .setParameter("to", to.name())
                .setParameter("accepted", "{" + String.join(",", accepted) + "}")
                .setParameter("at", Timestamp.from(at))
                .getResultList();

        return rows.isEmpty() ? Optional.empty() : Optional.of(toEntry(rows.get(0)));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AppointmentSnapshot> snapshotOf(AppointmentId id) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, service_offering_id, staff_id, status, starts_at
                  FROM appointments WHERE id = :id
                """)
                .setParameter("id", id.value())
                .getResultList();

        return rows.stream().findFirst().map(r -> new AppointmentSnapshot(
                AppointmentId.of((UUID) r[0]),
                ServiceOfferingId.of((UUID) r[1]),
                StaffId.of((UUID) r[2]),
                AppointmentStatus.valueOf((String) r[3]),
                instant(r[4])));
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
                                    Optional.ofNullable((String) c[2])),
                Optional.ofNullable((String) r[8]).filter(n -> !n.isBlank()));
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
