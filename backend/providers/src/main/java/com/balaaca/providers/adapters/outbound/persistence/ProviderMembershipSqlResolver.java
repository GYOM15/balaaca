package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.Membership;
import com.balaaca.platformkernel.tenancy.MembershipRole;
import com.balaaca.platformkernel.tenancy.NoProviderMembershipException;
import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.platformkernel.tenancy.ProviderMembershipResolver;
import com.balaaca.platformkernel.tenancy.ProviderNotPublishedException;
import jakarta.enterprise.context.ApplicationScoped;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;

/**
 * Resolves the tenant through the two SECURITY DEFINER functions.
 *
 * <p>The function returns the role as well as the tenant. It was in the
 * database and read by nobody, so every member with an account held full control
 * of the business.
 *
 * <p>A plain query would not work: provider_staff is itself tenant-scoped under
 * FORCE ROW LEVEL SECURITY, and no tenant is bound yet at resolution time - that
 * is the whole point of resolving. Reading it directly returns zero rows and
 * nobody can ever authenticate. The functions run as a role holding one narrow
 * policy and return a single uuid, so the escape is exactly as wide as it needs
 * to be.
 */
@ApplicationScoped
public class ProviderMembershipSqlResolver implements ProviderMembershipResolver {

    private final EntityManager em;

    public ProviderMembershipSqlResolver(EntityManager em) {
        this.em = em;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Membership requireFor(String keycloakSubject) {
        // Returns no row rather than a null column when the subject resolves to
        // nothing, so this reads a list. A suspended account, a suspended
        // business and a stranger are all the same empty answer.
        List<Object[]> rows = em.createNativeQuery(
                        "SELECT provider_id, staff_id, staff_role "
                        + "FROM app_resolve_membership(:subject)")
                .setParameter("subject", keycloakSubject)
                .getResultList();

        if (rows.isEmpty()) {
            throw new NoProviderMembershipException(keycloakSubject);
        }
        Object[] r = rows.get(0);
        return new Membership(ProviderId.of((UUID) r[0]),
                              StaffId.of((UUID) r[1]),
                              MembershipRole.of((String) r[2]));
    }

    @Override
    public ProviderId requirePublished(String slug) {
        UUID id = (UUID) em.createNativeQuery("SELECT app_resolve_published_provider(:slug)")
                .setParameter("slug", slug)
                .getSingleResult();
        if (id == null) {
            // Unknown and unpublished are the same answer on purpose: telling
            // them apart confirms an unpublished provider exists to anyone who
            // guesses its slug.
            throw new ProviderNotPublishedException(slug);
        }
        return ProviderId.of(id);
    }
}
