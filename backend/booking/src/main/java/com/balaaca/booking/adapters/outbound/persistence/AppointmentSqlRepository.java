package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.AppointmentStatus;
import com.balaaca.booking.domain.BookingExceptions.IdempotencyKeyReusedException;
import com.balaaca.booking.domain.BookingExceptions.SlotUnavailableException;
import com.balaaca.booking.domain.BookingExceptions.TransientBookingConflictException;
import com.balaaca.booking.domain.CustomerContact;
import com.balaaca.booking.domain.ServiceAddress;
import com.balaaca.booking.ports.outbound.AppointmentRepository;
import com.balaaca.catalog.ports.inbound.Fulfilment;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.CustomerId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.sharedkernel.phone.PhoneNumber;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.security.SecureRandom;
import java.sql.SQLException;
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

    /**
     * The digits and the upper-case letters with 0, O, 1, I and L removed,
     * because those are the characters a person hears wrong and reads wrong.
     * The same thirty-one V043 reissued the existing references with.
     */
    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final int BODY_LENGTH = 6;

    /** The two indexes a drawn body can collide with, and nothing else. */
    private static final String REFERENCE_KEY_INDEX = "uq_appointments_reference_key";
    private static final String REFERENCE_UNIQUE_INDEX = "uq_appointments_public_reference";

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
            // Half of a capability, minted here. The other half - the three
            // initials - is derived from the business name by the database
            // inside the statement below, so there is one implementation of
            // that rule and it is the one V043 reissued every existing row
            // with. Neither half is derived from the id, the phone or the time,
            // all of which someone could know.
            String referenceBody = mintReferenceBody();

            List<Object[]> inserted = em.createNativeQuery("""
                    INSERT INTO appointments (
                        id, provider_id, staff_id, service_offering_id, customer_id,
                        starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
                        blocked_from, blocked_until, service_name,
                        customer_price_amount_minor, customer_price_currency,
                        duration_minutes, source, idempotency_key, idempotency_request_hash,
                        public_reference, customer_note, turnaround_hours, ready_by,
                        service_fulfilment, service_locality_id, service_area,
                        service_directions, preferred_channel, status)
                    VALUES (
                        :id, :providerId, :staffId, :offeringId, :customerId,
                        :startsAt, :endsAt, :bufferBefore, :bufferAfter,
                        :blockedFrom, :blockedUntil, :serviceName,
                        :priceMinor, :currency, :duration, :source, :key, :hash,
                        -- The initials come from the row, not from Java. A
                        -- second implementation of the folding rule is a second
                        -- implementation that will stop agreeing with the first,
                        -- and this one has to agree with a unique index that was
                        -- built on it. RLS makes the provider readable here -
                        -- the auto_confirm subquery below reads the same row.
                        (SELECT app_booking_initials(business_name)
                           FROM providers WHERE id = :providerId)
                          || '-' || CAST(:referenceBody AS varchar),
                        :customerNote,
                        -- Frozen from the offering like the price and the
                        -- buffers, but only onto a booking that IS a drop-off:
                        -- the offering may announce a delay while this customer
                        -- chose to sit in the chair, and freezing it regardless
                        -- would promise them something would be ready on Friday.
                        -- ck_appointments_turnaround_is_drop_off refuses the
                        -- pair the other way round.
                        --
                        -- The promise is derived here rather than by the
                        -- application so the two cannot disagree: ready_by is
                        -- always ends_at plus the delay that was announced WHEN
                        -- THIS WAS BOOKED, and re-announcing a shorter one
                        -- tomorrow leaves this row alone.
                        CAST(:turnaround AS int),
                        -- endsAt is CAST here as well as bound: in this
                        -- position PostgreSQL cannot infer a parameter's type
                        -- from the other operand, so the addition was read as
                        -- interval + interval and the column refused it. The
                        -- same reason every optional filter in this codebase
                        -- casts its parameter.
                        CASE WHEN CAST(:turnaround AS int) IS NULL THEN NULL
                             ELSE CAST(:endsAt AS timestamptz)
                                  + make_interval(hours => CAST(:turnaround AS int))
                        END,
                        -- auto_confirm was a column with a DEFAULT of true and
                        -- no reader, so every appointment was born PENDING and
                        -- every salon confirmed by hand - the schema promising
                        -- one thing and the code doing another.
                        --
                        -- Read in the INSERT rather than fetched first: the
                        -- policy belongs to the row, and a value carried in
                        -- from the application is a value that can arrive
                        -- stale.
                        --
                        -- The provider typing it is the acceptance, so a
                        -- counter entry skips the queue whatever the policy
                        -- says: auto_confirm answers "do I want to see each
                        -- request first?", and the request it is about is a
                        -- stranger's. A walk-in left PENDING would put the
                        -- salon's own entry in the salon's own queue.
                        -- The customer's own choice, frozen. Not re-derivable
                        -- from the offering any more: since V044 it may publish
                        -- all three, and a braider who stops travelling must not
                        -- turn Thursday's house call into a chair in her salon.
                        :fulfilment,
                        -- Resolved here rather than carried in as an id: the
                        -- slug was already checked against the published map,
                        -- and an application layer with no use for a foreign
                        -- key should not be holding one.
                        (SELECT id FROM localities
                          WHERE slug = CAST(:serviceLocality AS varchar)),
                        CAST(:serviceArea AS varchar),
                        CAST(:serviceDirections AS varchar),
                        -- Frozen for the same reason the fulfilment above is:
                        -- this booking owes messages days later, and the only
                        -- other place the answer could live is the customer
                        -- row, which holds one entry per telephone number and
                        -- is upserted by every later booking.
                        :preferredChannel,
                        (SELECT CASE WHEN auto_confirm OR CAST(:accepted AS boolean)
                                     THEN 'CONFIRMED' ELSE 'PENDING' END
                           FROM providers WHERE id = :providerId))
                    ON CONFLICT (provider_id, idempotency_key)
                        WHERE idempotency_key IS NOT NULL
                    DO NOTHING
                    RETURNING id, status, public_reference
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
                    .setParameter("fulfilment", a.fulfilment().name())
                    .setParameter("preferredChannel", a.preferredChannel().name())
                    .setParameter("serviceLocality", a.serviceAddress()
                            .flatMap(ServiceAddress::localitySlug).orElse(null))
                    .setParameter("serviceArea", a.serviceAddress()
                            .flatMap(ServiceAddress::area).orElse(null))
                    .setParameter("serviceDirections", a.serviceAddress()
                            .map(ServiceAddress::directions).orElse(null))
                    .setParameter("blockedFrom", a.slot().blockedFrom())
                    .setParameter("blockedUntil", a.slot().blockedUntil())
                    .setParameter("serviceName", a.offering().name())
                    .setParameter("priceMinor", a.offering().price().amountMinor())
                    .setParameter("currency", a.offering().price().currency().name())
                    .setParameter("duration", (int) a.offering().duration().toMinutes())
                    .setParameter("source", a.source().name())
                    .setParameter("accepted", a.source().arrivesAccepted())
                    .setParameter("key", key)
                    .setParameter("hash", a.idempotencyRequestHash().orElse(null))
                    .setParameter("referenceBody", referenceBody)
                    .setParameter("customerNote", a.customerNote().orElse(null))
                    .setParameter("turnaround", turnaroundOf(a))
                    // RETURNING rather than a row count: the status is decided
                    // by the provider's auto_confirm inside this statement, and
                    // reading it back afterwards would be a second query
                    // answering about a row another request may have moved.
                    // Zero rows still means the conflict target fired.
                    .getResultList();

            if (!inserted.isEmpty()) {
                Object[] row = (Object[]) inserted.get(0);
                return new InsertOutcome(a.id(), (String) row[2],
                                         AppointmentStatus.valueOf((String) row[1]), false);
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
                SELECT id, idempotency_request_hash, public_reference, status
                  FROM appointments
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
        return Optional.of(new InsertOutcome(AppointmentId.of((UUID) r[0]), (String) r[2],
                                             AppointmentStatus.valueOf((String) r[3]), true));
    }

    /**
     * The delay this BOOKING carries, which is the offering's only when the
     * customer chose to hand the work over.
     *
     * <p>The offering's own turnaround belongs to its drop-off mode, and a
     * service may now publish that mode alongside others. Anything else here
     * would announce a workshop delay to somebody who never left the chair.
     */
    private static Integer turnaroundOf(NewAppointment a) {
        return a.fulfilment() == Fulfilment.DROP_OFF
                ? a.offering().turnaround().map(t -> (int) t.toHours()).orElse(null)
                : null;
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
            // A drawn body that somebody already holds. One in 887 million per
            // prefix, which is rare and not impossible, and the customer must
            // never be handed the reference of another appointment - so this is
            // retried and never swallowed.
            //
            // Retried by BookAppointmentService, which opens a NEW transaction
            // per attempt and draws again on the way through. A loop here would
            // fail on its own second statement: once a constraint fires, the
            // transaction is rollback-only and nothing further can run in it.
            // The budget is bounded there, and exhausting it answers 429 rather
            // than reusing anything.
            if (namesAReferenceIndex(e)) {
                return new TransientBookingConflictException(e);
            }
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
        //
        // The join is what the parameter is for, and until V032 there was none:
        // this method took a service and ignored it, so a customer booking
        // braids could be handed to the nail technician because she was the
        // least busy. INNER, because competence is strict - no row means the
        // person does not perform it.
        List<UUID> ids = em.createNativeQuery("""
                SELECT s.id FROM provider_staff s
                  JOIN staff_service_offerings j
                    ON j.staff_id = s.id AND j.service_offering_id = :offering
                 WHERE s.bookable AND s.status = 'ACTIVE'
                 ORDER BY (SELECT count(*) FROM appointments a
                            WHERE a.staff_id = s.id
                              AND a.status IN ('PENDING','CONFIRMED')), s.id
                """).setParameter("offering", serviceOfferingId.value()).getResultList();
        return ids.stream().map(StaffId::of).toList();
    }

    @Override
    public long freeStaffCount(ServiceOfferingId serviceOfferingId, Optional<StaffId> staffId,
                               Instant blockedFrom, Instant blockedUntil) {
        // The same bookable predicate AND the same competence join eligibleStaff
        // uses, so the two agree on who counts. If only one of them joined, a
        // salon whose one braider is busy would be told the system was merely
        // congested and to try again, forever. The optional filter casts its
        // parameter: PostgreSQL refuses a statement whose only unambiguous use
        // of a parameter is beside IS NULL, with 42P18, rather than guessing.
        Number free = (Number) em.createNativeQuery("""
                SELECT count(*) FROM provider_staff s
                  JOIN staff_service_offerings j
                    ON j.staff_id = s.id AND j.service_offering_id = :offering
                 WHERE s.bookable AND s.status = 'ACTIVE'
                   AND (CAST(:staffId AS uuid) IS NULL OR s.id = CAST(:staffId AS uuid))
                   AND NOT EXISTS (
                       SELECT 1 FROM appointments a
                        WHERE a.staff_id = s.id
                          AND a.status IN ('PENDING','CONFIRMED')
                          AND a.blocked_range && tstzrange(:from, :until, '[)'))
                """)
                .setParameter("offering", serviceOfferingId.value())
                .setParameter("staffId", staffId.map(StaffId::value).orElse(null))
                .setParameter("from", java.sql.Timestamp.from(blockedFrom))
                .setParameter("until", java.sql.Timestamp.from(blockedUntil))
                .getSingleResult();
        return free.longValue();
    }

    /**
     * Whether this person performs this service at all.
     *
     * <p>Deliberately silent about bookable and about status, which the
     * eligibility query asks separately. A provider writing a walk-in into
     * their own diary may name somebody the customer's list never offers - that
     * is the point of a walk-in - but nobody may be assigned work they do not
     * do.
     */
    @Override
    public boolean performs(StaffId staffId, ServiceOfferingId serviceOfferingId) {
        return !em.createNativeQuery("""
                SELECT 1 FROM staff_service_offerings
                 WHERE staff_id = :staff AND service_offering_id = :offering
                """)
                .setParameter("staff", staffId.value())
                .setParameter("offering", serviceOfferingId.value())
                .getResultList().isEmpty();
    }

    @Override
    public boolean canBeAssigned(StaffId staffId, boolean mustBeBookable) {
        return !em.createNativeQuery("""
                SELECT 1 FROM provider_staff
                 WHERE id = :staff AND status = 'ACTIVE'
                   AND (NOT CAST(:mustBeBookable AS boolean) OR bookable)
                """)
                .setParameter("staff", staffId.value())
                .setParameter("mustBeBookable", mustBeBookable)
                .getResultList().isEmpty();
    }

    @Override
    public CustomerId upsertCustomer(CustomerContact contact) {
        UUID providerId = tenantContext.require().value();
        // DO UPDATE rather than DO NOTHING, so that RETURNING yields the id on
        // both paths. The name is not overwritten: the provider may have
        // corrected it in their own address book.
        //
        // The email is FILLED IN and never replaced. A returning customer who
        // has now given one must have it stored, because the choice of email as
        // their channel is frozen on the appointment and the messages it owes
        // are addressed from this row weeks later: leaving the column NULL
        // would make a cancellation notice unsendable for a booking the server
        // had already accepted. coalesce keeps the provider's own correction
        // winning, which is the rule the name already follows.
        UUID id = (UUID) em.createNativeQuery("""
                INSERT INTO customers (id, provider_id, full_name, phone_e164, email)
                VALUES (:id, :providerId, :fullName, :phone, :email)
                ON CONFLICT (provider_id, phone_e164)
                DO UPDATE SET email = coalesce(customers.email, EXCLUDED.email),
                              updated_at = now()
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

    @Override
    public boolean isBlocked(PhoneNumber phone) {
        // No provider predicate: RLS supplies it, and the unique index the
        // upsert arbitrates on is the one this read uses. A number blocked at
        // one salon is nothing at all at the next, which is what makes this a
        // provider's own address book rather than a platform blacklist.
        return !em.createNativeQuery("""
                SELECT 1 FROM customers WHERE phone_e164 = :phone AND blocked
                """)
                .setParameter("phone", phone.e164())
                .getResultList().isEmpty();
    }
    /**
     * Which unique index fired, read out of the driver's own message.
     *
     * <p>The typed accessor for a constraint name lives on PSQLException, and
     * the PostgreSQL driver is not a dependency of this module - it arrives at
     * runtime through the deployable. The two names are ours, they are created
     * by migrations, and a message that names neither is not a collision.
     */
    private static boolean namesAReferenceIndex(Throwable e) {
        for (Throwable t = e; t != null && t.getCause() != t; t = t.getCause()) {
            String message = t.getMessage();
            if (message != null && (message.contains(REFERENCE_KEY_INDEX)
                                    || message.contains(REFERENCE_UNIQUE_INDEX))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Six symbols, and deliberately not the appointment's id: the id appears on
     * the provider's agenda, in the audit trail and in log lines, and a
     * capability has to be a value whose only job is to be one, so that widening
     * where the id is used never widens what the id can do.
     *
     * <p>{@code nextInt} rather than a random byte reduced modulo 31. 256 is not
     * a multiple of 31, so the fold would make the first eight symbols of the
     * alphabet 12% likelier than the rest; nextInt rejects the tail of the range
     * instead. Thirty-one symbols is not much to give away, and this is the only
     * thing standing between a stranger and one customer's appointment.
     */
    private static String mintReferenceBody() {
        StringBuilder body = new StringBuilder(BODY_LENGTH);
        for (int i = 0; i < BODY_LENGTH; i++) {
            body.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return body.toString();
    }

}
