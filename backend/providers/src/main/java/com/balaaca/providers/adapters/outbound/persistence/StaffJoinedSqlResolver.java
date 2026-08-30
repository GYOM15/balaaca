package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.domain.InvitationNotFoundException;
import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase.JoinedProvider;
import com.balaaca.providers.ports.outbound.StaffJoinedRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.util.List;

/**
 * What to tell someone who has just joined, read before any request has bound
 * their new tenant.
 *
 * <p>Through the read-only resolver, like every other pre-tenant read: the
 * membership exists as of this transaction, and the connection serving it still
 * has no {@code app.provider_id}.
 */
@ApplicationScoped
public class StaffJoinedSqlResolver implements StaffJoinedRepository {

    private final EntityManager em;

    public StaffJoinedSqlResolver(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public JoinedProvider describe(String subject) {
        List<Object[]> rows = em.createNativeQuery(
                        "SELECT provider_slug, business_name, display_name "
                        + "FROM app_describe_membership(:subject)")
                .setParameter("subject", subject)
                .getResultList();

        Object[] r = rows.stream().findFirst().orElseThrow(InvitationNotFoundException::new);
        return new JoinedProvider((String) r[0], (String) r[1], (String) r[2]);
    }
}
