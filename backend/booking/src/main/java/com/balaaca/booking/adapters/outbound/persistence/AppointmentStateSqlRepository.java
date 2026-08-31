package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingExceptions.SlotUnavailableException;
import com.balaaca.booking.domain.BookingExceptions.TransientBookingConflictException;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.domain.ServiceAddress;
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
                          customer_id, customer_note, staff_id, ready_by, ready_at,
                          service_locality_id, service_area, service_directions
                """)
                .setParameter("id", id.value())
                .setParameter("reason", reason.orElse(null))
                .setParameter("at", Timestamp.from(at))
                .getResultList();

        return rows.isEmpty() ? Optional.empty() : Optional.of(toEntry(rows.get(0)));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AgendaEntry> reschedule(AppointmentId id, BookedSlot slot,
                                           Optional<StaffId> staffId, Instant at) {
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
                       -- COALESCE, so a move naming no chair leaves the row on
                       -- the one it has. The chair changes in THIS statement
                       -- and not a second one: the exclusion constraint keys on
                       -- staff_id, so releasing the old resource and taking the
                       -- new one apart would leave a window in which a third
                       -- booking fits into the appointment being moved.
                       staff_id = COALESCE(CAST(:staffId AS uuid), staff_id),
                       version = version + 1,
                       updated_at = :at
                 WHERE id = :id
                   AND status IN ('PENDING','CONFIRMED')
                RETURNING id, starts_at, ends_at, status, service_name,
                          customer_price_amount_minor, customer_price_currency,
                          customer_id, customer_note, staff_id, ready_by, ready_at,
                          service_locality_id, service_area, service_directions
                """)
                .setParameter("id", id.value())
                .setParameter("startsAt", Timestamp.from(slot.startsAt()))
                .setParameter("endsAt", Timestamp.from(slot.endsAt()))
                .setParameter("blockedFrom", Timestamp.from(slot.blockedFrom()))
                .setParameter("blockedUntil", Timestamp.from(slot.blockedUntil()))
                .setParameter("staffId", staffId.map(StaffId::value).orElse(null))
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

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AgendaEntry> markReady(AppointmentId id, Instant at) {
        // Every condition is in the WHERE, so two people tapping "ready" at
        // once produce one affected row and one zero - and the second does not
        // move a date the customer has already been given.
        List<Object[]> rows = em.createNativeQuery("""
                UPDATE appointments
                   -- COALESCE, not a WHERE on ready_at IS NULL: saying it twice
                   -- keeps the FIRST instant, because the customer was told
                   -- once and a second date would move a fact - and the row
                   -- still comes back, so the second tap is answered rather
                   -- than refused for something that already happened.
                   SET ready_at = COALESCE(ready_at, :at),
                       version = version + 1,
                       updated_at = :at
                 WHERE id = :id
                   AND turnaround_hours IS NOT NULL
                   AND status <> 'CANCELLED'
                RETURNING id, starts_at, ends_at, status, service_name,
                          customer_price_amount_minor, customer_price_currency,
                          customer_id, customer_note, staff_id, ready_by, ready_at,
                          service_locality_id, service_area, service_directions
                """)
                .setParameter("id", id.value())
                .setParameter("at", Timestamp.from(at))
                .getResultList();

        return rows.isEmpty() ? Optional.empty() : Optional.of(toEntry(rows.get(0)));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<AgendaEntry> replaceReadyBy(AppointmentId id, Instant readyBy, Instant at) {
        // ends_at is compared in the statement rather than read first: a
        // read-then-write would be a window in which the appointment moves, and
        // ck_appointments_ready_after_handover would then answer with a
        // constraint name instead of a sentence.
        List<Object[]> rows = em.createNativeQuery("""
                UPDATE appointments
                   SET ready_by = :readyBy,
                       version = version + 1,
                       updated_at = :at
                 WHERE id = :id
                   AND turnaround_hours IS NOT NULL
                   AND status <> 'CANCELLED'
                   AND :readyBy >= ends_at
                RETURNING id, starts_at, ends_at, status, service_name,
                          customer_price_amount_minor, customer_price_currency,
                          customer_id, customer_note, staff_id, ready_by, ready_at,
                          service_locality_id, service_area, service_directions
                """)
                .setParameter("id", id.value())
                .setParameter("readyBy", Timestamp.from(readyBy))
                .setParameter("at", Timestamp.from(at))
                .getResultList();

        return rows.isEmpty() ? Optional.empty() : Optional.of(toEntry(rows.get(0)));
    }

    @Override
    public boolean activeStaffExists(StaffId staffId) {
        // RLS scopes this to the caller's own provider, so a colleague at
        // another salon is invisible here and answers as one who never existed.
        return !em.createNativeQuery(
                "SELECT 1 FROM provider_staff WHERE id = :id AND status = 'ACTIVE'")
                .setParameter("id", staffId.value())
                .getResultList()
                .isEmpty();
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
                          customer_id, customer_note, staff_id, ready_by, ready_at,
                          service_locality_id, service_area, service_directions
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

        String staffName = (String) em.createNativeQuery(
                "SELECT display_name FROM provider_staff WHERE id = :id")
                .setParameter("id", r[9])
                .getSingleResult();

        return new AgendaEntry(
                AppointmentId.of((UUID) r[0]),
                instant(r[1]),
                instant(r[2]),
                AppointmentStatus.valueOf((String) r[3]),
                (String) r[4],
                Money.ofMinor(((Number) r[5]).longValue(), Currency.of((String) r[6])),
                StaffId.of((UUID) r[9]),
                staffName,
                new CustomerContact((String) c[0], new PhoneNumber((String) c[1]),
                                    Optional.ofNullable((String) c[2])),
                Optional.ofNullable((String) r[8]).filter(n -> !n.isBlank()),
                Optional.ofNullable(r[10]).map(AppointmentStateSqlRepository::instant),
                Optional.ofNullable(r[11]).map(AppointmentStateSqlRepository::instant),
                address(r[12], (String) r[13], (String) r[14]));
    }

    /**
     * The address, or nothing at all.
     *
     * <p>Keyed on the directions, which the schema makes present exactly when
     * the provider travels. The commune is read back as a slug rather than the
     * stored id: an id means nothing to a client, and the slug is what the rest
     * of the API already speaks.
     */
    private Optional<ServiceAddress> address(Object localityId, String area, String directions) {
        if (directions == null) {
            return Optional.empty();
        }
        return Optional.of(new ServiceAddress(
                Optional.ofNullable(localityId).map(this::slugOf),
                Optional.ofNullable(area),
                directions));
    }

    private String slugOf(Object localityId) {
        return (String) em.createNativeQuery("SELECT slug FROM localities WHERE id = :id")
                .setParameter("id", localityId)
                .getSingleResult();
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
