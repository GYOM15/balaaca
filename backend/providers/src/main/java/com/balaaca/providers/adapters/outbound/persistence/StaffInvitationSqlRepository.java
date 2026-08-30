package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.providers.domain.AlreadyRegisteredException;
import com.balaaca.providers.domain.InvitationNotFoundException;
import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase.Account;
import com.balaaca.providers.ports.outbound.StaffInvitationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

/**
 * Redeeming a code, in SQL.
 *
 * <p>Through {@code app_accept_staff_invitation} for the same reason signing up
 * goes through its own function: {@code provider_staff} is tenant-scoped under
 * FORCE RLS and the caller has no tenant, which is the point. The function is
 * owned by balaaca_registrar, and the policy behind it admits an UPDATE only on
 * a row that is unclaimed, active and STAFF - so an owner's seat cannot be taken
 * over by an invitation even if the function were rewritten wrongly.
 *
 * <p>The two outcomes a caller can act on arrive as SQLSTATEs the function
 * raises deliberately, exactly as registration does.
 */
@ApplicationScoped
public class StaffInvitationSqlRepository implements StaffInvitationRepository {

    private static final String NO_SUCH_INVITATION = "Z0003";
    private static final String ALREADY_REGISTERED = "Z0002";

    private final EntityManager em;

    public StaffInvitationSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public ProviderId accept(String code, Account account) {
        try {
            List<UUID> rows = em.createNativeQuery("""
                    SELECT app_accept_staff_invitation(
                            CAST(:code AS varchar), CAST(:subject AS varchar),
                            CAST(:userId AS uuid), CAST(:displayName AS varchar),
                            CAST(:email AS varchar))
                    """)
                    .setParameter("code", code)
                    .setParameter("subject", account.subject())
                    .setParameter("userId", UUID.randomUUID())
                    .setParameter("displayName", account.displayName())
                    .setParameter("email", account.email().orElse(null))
                    .getResultList();

            return rows.stream().findFirst().map(ProviderId::of)
                    .orElseThrow(InvitationNotFoundException::new);

        } catch (PersistenceException e) {
            // No further database work: the transaction is already rollback-only.
            String state = sqlState(e);
            if (NO_SUCH_INVITATION.equals(state)) {
                throw new InvitationNotFoundException();
            }
            if (ALREADY_REGISTERED.equals(state)) {
                throw new AlreadyRegisteredException();
            }
            throw e;
        }
    }

    /** The cause chain: the driver's exception is wrapped by the time it arrives. */
    private static String sqlState(Throwable e) {
        for (Throwable t = e; t != null && t.getCause() != t; t = t.getCause()) {
            if (t instanceof SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }
}
