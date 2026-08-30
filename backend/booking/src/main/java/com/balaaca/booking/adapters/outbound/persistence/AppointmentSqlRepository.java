package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.BookingExceptions.IdempotencyKeyReusedException;
import com.balaaca.booking.domain.BookingExceptions.SlotUnavailableException;
import com.balaaca.booking.domain.BookingExceptions.TransientBookingConflictException;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.ports.outbound.AppointmentRepository;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.CustomerId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.util.Base64;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The edge where domain types become columns. Unwrapping an identifier to a raw
 * uuid belongs here and nowhere inward: this is the only class that has to know
 * a {@code StaffId} is a uuid at all.
 */
@ApplicationScoped
public class AppointmentSqlRepository implements AppointmentRepository {

    private static final SecureRandom RANDOM = new SecureRandom();

    private static final String EXCLUSION_VIOLATION = "23P01";
    private static final String UNIQUE_VIOLATION = "23505";
    private static final String DEADLOCK_DETECTED = "40P01";

    private final EntityManager em;
    private final TenantContext tenantContext;

    public AppointmentSqlRepository(EntityManager em, TenantContext tenantContext) {
        this.em = em;
        this.tenantContext = tenantContext;
    }

    @Override
    public InsertOutcome insertIfAbsent(NewAppointment a) {
        // provider_id is bound from TenantContext rather than taken from the
        // command: a native insert bypasses any ORM-level tenant filter, so this
        // is the only place it can come from, and RLS WITH CHECK is the backstop
        // if it is ever wrong.
        UUID providerId = tenantContext.require().value();
        String key = a.idempotencyKey().orElse(null);

        try {
            // A capability, minted here and nowhere else. 256 bits from a
            // SecureRandom: it is the only thing standing between a stranger
            // and one customer's appointment, so it is not derived from the
            // id, the phone or the time - all of which someone could know.
            String reference = mintReference();

            int inserted = em.createNativeQuery("""
                    INSERT INTO appointments (
                        id, provider_id, staff_id, service_offering_id, customer_id,
                        starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
                        blocked_from, blocked_until, service_name,
                        customer_price_amount_minor, customer_price_currency,
                        duration_minutes, source, idempotency_key, idempotency_request_hash,
                        public_reference)
                    VALUES (
                        :id, :providerId, :staffId, :offeringId, :customerId,
                        :startsAt, :endsAt, :bufferBefore, :bufferAfter,
                        :blockedFrom, :blockedUntil, :serviceName,
                        :priceMinor, :currency, :duration, :source, :key, :hash,
                        :reference)
                    ON CONFLICT (provider_id, idempotency_key)
                        WHERE idempotency_key IS NOT NULL
                    DO NOTHING
                    """)
                    .setParameter("id", a.id().value())
                    .setParameter("providerId", providerId)
                    .setParameter("staffId", a.staffId().value())
                    .setParameter("offeringId", a.offering().id().value())
                    .setParameter("customerId", a.customerId().value())
                    .setParameter("startsAt", a.slot().startsAt())
                    .setParameter("endsAt", a.slot().endsAt())
                    .setParameter("bufferBefore", a.slot().bufferBeforeMinutes())
                    .setParameter("bufferAfter", a.slot().bufferAfterMinutes())
                    .setParameter("blockedFrom", a.slot().blockedFrom())
                    .setParameter("blockedUntil", a.slot().blockedUntil())
                    .setParameter("serviceName", a.offering().name())
                    .setParameter("priceMinor", a.offering().price().amountMinor())
                    .setParameter("currency", a.offering().price().currency().name())
                    .setParameter("duration", (int) a.offering().duration().toMinutes())
                    .setParameter("source", a.source().name())
                    .setParameter("key", key)
                    .setParameter("hash", a.idempotencyRequestHash().orElse(null))
                    .setParameter("reference", reference)
                    .executeUpdate();

            if (inserted == 1) {
                return new InsertOutcome(a.id(), reference, false);
            }
            // Zero rows means the conflict target fired, so the key exists and
            // a row must be readable. Finding none would mean the index and the
            // table disagree, which is not a replay.
            return findReplay(providerId, key, a.idempotencyRequestHash().orElse(null))
                    .orElseThrow(() -> new IdempotencyKeyReusedException(key));

        } catch (PersistenceException e) {
            throw translate(e, a);
        }
    }

    @Override
    public Optional<InsertOutcome> replayOf(String idempotencyKey, String requestHash) {
        return findReplay(tenantContext.require().value(), idempotencyKey, requestHash);
    }

    /** Same key and same request is the first result; same key, different request is a bug. */
    @SuppressWarnings("unchecked")
    private Optional<InsertOutcome> findReplay(UUID providerId, String key, String hash) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, idempotency_request_hash, public_reference FROM appointments
                 WHERE provider_id = :providerId AND idempotency_key = :key
                """)
                .setParameter("providerId", providerId)
                .setParameter("key", key)
                .getResultList();

        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Object[] r = rows.get(0);
        if (hash != null && !hash.equals(r[1])) {
            throw new IdempotencyKeyReusedException(key);
        }
        // The stored one, never a fresh mint: a retry that came back with a
        // different reference would leave the customer holding a key to nothing.
        return Optional.of(new InsertOutcome(AppointmentId.of((UUID) r[0]),
                                             (String) r[2], true));
    }

    /**
     * Turns a SQLSTATE into the right business answer. The distinction that
     * matters is 23P01 against 40P01: both mean this transaction lost, but only
     * the first means the slot is taken.
     */
    private RuntimeException translate(PersistenceException e, NewAppointment a) {
        String state = sqlState(e);
        if (EXCLUSION_VIOLATION.equals(state)) {
            return new SlotUnavailableException(a.slot().startsAt(), a.staffId().value());
        }
        if (DEADLOCK_DETECTED.equals(state)) {
            return new TransientBookingConflictException(e);
        }
        if (UNIQUE_VIOLATION.equals(state)) {
            return new IdempotencyKeyReusedException(a.idempotencyKey().orElse(null));
        }
        return e;
    }

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
    public List<StaffId> eligibleStaff(ServiceOfferingId serviceOfferingId) {
        // Least loaded first, ties broken by id so the order is stable. RLS
        // supplies the tenant predicate.
        List<UUID> ids = em.createNativeQuery("""
                SELECT s.id FROM provider_staff s
                 WHERE s.bookable AND s.status = 'ACTIVE'
                 ORDER BY (SELECT count(*) FROM appointments a
                            WHERE a.staff_id = s.id
                              AND a.status IN ('PENDING','CONFIRMED')), s.id
                """).getResultList();
        return ids.stream().map(StaffId::of).toList();
    }

    @Override
    public long freeStaffCount(Optional<StaffId> staffId, Instant blockedFrom, Instant blockedUntil) {
        // The same bookable predicate eligibleStaff uses, so the two agree on
        // who counts. The optional filter casts its parameter: PostgreSQL
        // refuses a statement whose only unambiguous use of a parameter is
        // beside IS NULL, with 42P18, rather than guessing its type.
        Number free = (Number) em.createNativeQuery("""
                SELECT count(*) FROM provider_staff s
                 WHERE s.bookable AND s.status = 'ACTIVE'
                   AND (CAST(:staffId AS uuid) IS NULL OR s.id = CAST(:staffId AS uuid))
                   AND NOT EXISTS (
                       SELECT 1 FROM appointments a
                        WHERE a.staff_id = s.id
                          AND a.status IN ('PENDING','CONFIRMED')
                          AND a.blocked_range && tstzrange(:from, :until, '[)'))
                """)
                .setParameter("staffId", staffId.map(StaffId::value).orElse(null))
                .setParameter("from", java.sql.Timestamp.from(blockedFrom))
                .setParameter("until", java.sql.Timestamp.from(blockedUntil))
                .getSingleResult();
        return free.longValue();
    }

    @Override
    public CustomerId upsertCustomer(CustomerContact contact) {
        UUID providerId = tenantContext.require().value();
        // DO UPDATE on a column nobody reads, rather than DO NOTHING, so that
        // RETURNING yields the id on both paths. The name is not overwritten:
        // the provider may have corrected it in their own address book.
        UUID id = (UUID) em.createNativeQuery("""
                INSERT INTO customers (id, provider_id, full_name, phone_e164, email)
                VALUES (:id, :providerId, :fullName, :phone, :email)
                ON CONFLICT (provider_id, phone_e164)
                DO UPDATE SET updated_at = now()
                RETURNING id
                """)
                .setParameter("id", UUID.randomUUID())
                .setParameter("providerId", providerId)
                .setParameter("fullName", contact.fullName())
                .setParameter("phone", contact.phone().e164())
                .setParameter("email", contact.email().orElse(null))
                .getSingleResult();
        return CustomerId.of(id);
    }
    /**
     * URL-safe, unpadded, 43 characters. Deliberately not the appointment's id:
     * the id appears on the provider's agenda, in the audit trail and in log
     * lines, and a capability has to be a value whose only job is to be one, so
     * that widening where the id is used never widens what the id can do.
     */
    private static String mintReference() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

}
