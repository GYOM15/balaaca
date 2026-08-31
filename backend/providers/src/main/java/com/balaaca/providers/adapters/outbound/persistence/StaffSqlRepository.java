package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.providers.domain.StaffStillBookedException;
import com.balaaca.providers.ports.inbound.ListStaffUseCase.StaffDefinition;
import com.balaaca.providers.ports.inbound.ListStaffUseCase.StaffMember;
import com.balaaca.providers.ports.outbound.StaffRepository;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The caller's people, in SQL.
 *
 * <p>Reads and the update carry no provider predicate: RLS supplies it, so a
 * staff member who is not the caller's is invisible rather than forbidden, and
 * an update naming someone else's id simply matches nothing. The insert is the
 * exception - a native insert bypasses any tenant filter, so provider_id comes
 * from TenantContext and the policy's WITH CHECK is the backstop.
 *
 * <p>role is written as STAFF and never taken from the caller. The owner is the
 * row registration wrote, and moving ownership is not an edit to a member.
 */
@ApplicationScoped
public class StaffSqlRepository implements StaffRepository {

    private static final String STILL_BOOKED = "Z0006";

    private final EntityManager em;
    private final TenantContext tenantContext;

    public StaffSqlRepository(EntityManager em, TenantContext tenantContext) {
        this.em = em;
        this.tenantContext = tenantContext;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<StaffMember> currentStaff() {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, display_name, role, bookable, status
                  FROM provider_staff
                 ORDER BY (status = 'ACTIVE') DESC, display_name
                """).getResultList();

        return rows.stream().map(StaffSqlRepository::toMember).toList();
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<StaffMember> byId(StaffId id) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, display_name, role, bookable, status
                  FROM provider_staff
                 WHERE id = :id
                """)
                .setParameter("id", id.value())
                .getResultList();

        // A row at another provider is invisible to this read, so it answers as
        // one that never existed.
        return rows.stream().findFirst().map(StaffSqlRepository::toMember);
    }

    @Override
    @SuppressWarnings("unchecked")
    public StaffMember insert(StaffDefinition definition) {
        UUID id = UUID.randomUUID();
        // user_id stays null: a member is a bookable resource, and the unique
        // index on one active membership per account would otherwise refuse a
        // second person the moment two of them shared an owner's account.
        em.createNativeQuery("""
                INSERT INTO provider_staff
                       (id, provider_id, user_id, display_name, role, bookable, status)
                VALUES (:id, :providerId, NULL, :displayName, 'STAFF', :bookable, :status)
                """)
                .setParameter("id", id)
                .setParameter("providerId", tenantContext.require().value())
                .setParameter("displayName", definition.displayName())
                .setParameter("bookable", definition.bookable())
                .setParameter("status", definition.active() ? "ACTIVE" : "DISABLED")
                .executeUpdate();

        return read(StaffId.of(id)).orElseThrow();
    }

    @Override
    public Optional<StaffMember> update(StaffId id, StaffDefinition definition) {
        int changed;
        try {
            changed = em.createNativeQuery("""
                    UPDATE provider_staff
                       SET display_name = :displayName,
                           bookable     = :bookable,
                           status       = :status,
                           updated_at   = now()
                     WHERE id = :id
                    """)
                    .setParameter("id", id.value())
                    .setParameter("displayName", definition.displayName())
                    .setParameter("bookable", definition.bookable())
                    .setParameter("status", definition.active() ? "ACTIVE" : "DISABLED")
                    .executeUpdate();
        } catch (PersistenceException e) {
            // V038's trigger, which refuses to retire somebody customers are
            // still booked with. Read as a SQLSTATE rather than pre-counted
            // here: two requests could both pass a count and only one pass the
            // trigger, and the count would be a second place to forget the rule.
            if (STILL_BOOKED.equals(sqlState(e))) {
                throw new StaffStillBookedException();
            }
            throw e;
        }

        // Zero rows is a miss and another provider's member alike, because RLS
        // removed the row from the statement's reach before it ran.
        return changed == 0 ? Optional.empty() : read(id);
    }

    /** Raised by trg_provider_staff_no_orphaned_appointments. */
    private static String sqlState(Throwable e) {
        for (Throwable t = e; t != null && t.getCause() != t; t = t.getCause()) {
            if (t instanceof java.sql.SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    @Override
    public long otherBookableStaff(StaffId excluding) {
        return ((Number) em.createNativeQuery("""
                SELECT count(*) FROM provider_staff
                 WHERE status = 'ACTIVE' AND bookable AND id <> :excluding
                """)
                .setParameter("excluding", excluding.value())
                .getSingleResult()).longValue();
    }

    @SuppressWarnings("unchecked")
    private Optional<StaffMember> read(StaffId id) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, display_name, role, bookable, status
                  FROM provider_staff WHERE id = :id
                """).setParameter("id", id.value()).getResultList();

        return rows.stream().findFirst().map(StaffSqlRepository::toMember);
    }

    private static StaffMember toMember(Object[] r) {
        return new StaffMember(StaffId.of((UUID) r[0]), (String) r[1], (String) r[2],
                               (Boolean) r[3], "ACTIVE".equals(r[4]));
    }
    @Override
    @SuppressWarnings("unchecked")
    public boolean exists(StaffId id) {
        return !em.createNativeQuery("SELECT 1 FROM provider_staff WHERE id = :id")
                .setParameter("id", id.value())
                .getResultList().isEmpty();
    }

    @Override
    public boolean issueInvitation(StaffId id, String code, Instant expiresAt) {
        // Every condition is in the statement. A read-then-write would leave a
        // window in which a member is given an account between the check and the
        // code being written, and the owner would hand out a second way into a
        // seat that is already taken.
        return em.createNativeQuery("""
                UPDATE provider_staff
                   SET invitation_token = :code,
                       invitation_expires_at = :expiresAt,
                       updated_at = now()
                 WHERE id = :id
                   AND user_id IS NULL
                   AND role = 'STAFF'
                   AND status = 'ACTIVE'
                """)
                .setParameter("id", id.value())
                .setParameter("code", code)
                .setParameter("expiresAt", Timestamp.from(expiresAt))
                .executeUpdate() == 1;
    }

}
