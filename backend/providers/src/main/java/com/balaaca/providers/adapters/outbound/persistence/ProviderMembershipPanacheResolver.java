package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.NoProviderMembershipException;
import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.platformkernel.tenancy.ProviderMembershipResolver;
import com.balaaca.platformkernel.tenancy.ProviderNotPublishedException;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.util.UUID;

/**
 * Resolves the tenant through the two SECURITY DEFINER functions.
 *
 * <p>A plain query would not work: provider_staff is itself tenant-scoped under
 * FORCE ROW LEVEL SECURITY, and no tenant is bound yet at resolution time - that
 * is the whole point of resolving. Reading it directly returns zero rows and
 * nobody can ever authenticate. The functions run as a role holding one narrow
 * policy and return a single uuid, so the escape is exactly as wide as it needs
 * to be.
 */
@ApplicationScoped
public class ProviderMembershipPanacheResolver implements ProviderMembershipResolver {

    private final EntityManager em;

    public ProviderMembershipPanacheResolver(EntityManager em) {
        this.em = em;
    }

    @Override
    public ProviderId requireFor(String keycloakSubject) {
        UUID id = (UUID) em.createNativeQuery("SELECT app_resolve_provider(:subject)")
                .setParameter("subject", keycloakSubject)
                .getSingleResult();
        if (id == null) {
            throw new NoProviderMembershipException(keycloakSubject);
        }
        return ProviderId.of(id);
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
