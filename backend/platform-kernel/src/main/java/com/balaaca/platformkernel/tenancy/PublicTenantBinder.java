package com.balaaca.platformkernel.tenancy;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Binds the tenant on the public path, where the caller is a customer rather
 * than staff and so has no membership to resolve.
 *
 * <p>The capability granted here is "resolve a published slug and bind it", not
 * "set the tenant": callers pass a slug, never a {@link ProviderId}. An
 * unpublished or unknown slug resolves to nothing and the request 404s, so the
 * public path can only ever reach a provider that chose to be public.
 */
@ApplicationScoped
public class PublicTenantBinder {

    private final TenantContext tenantContext;
    private final ProviderMembershipResolver memberships;

    public PublicTenantBinder(TenantContext tenantContext, ProviderMembershipResolver memberships) {
        this.tenantContext = tenantContext;
        this.memberships = memberships;
    }

    /** @throws ProviderNotPublishedException when the slug names no published provider */
    public ProviderId bindPublished(String slug) {
        ProviderId providerId = memberships.requirePublished(slug);
        tenantContext.assign(providerId);
        return providerId;
    }

    public void clear() {
        tenantContext.clear();
    }
}
