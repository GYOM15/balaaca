package com.balaaca.platformkernel.tenancy;

import jakarta.enterprise.context.RequestScoped;
import java.util.Optional;

/**
 * The tenant bound to the current request. Assigned once, by the tenant
 * interceptor, from a server-resolved source - never from a request field.
 *
 * <p>{@code assign} and {@code clear} are package-private on purpose: business
 * code that could set the tenant could also change it.
 */
@RequestScoped
public class TenantContext {

    private ProviderId providerId;

    /** The bound tenant. Throws when nothing resolved, which is the safe default. */
    public ProviderId require() {
        if (providerId == null) {
            throw new NoProviderMembershipException(null);
        }
        return providerId;
    }

    /**
     * The bound tenant if there is one. Exists for the connection hook, which
     * runs on transactions that legitimately have no tenant - a migration, a
     * readiness probe, the notification drain.
     */
    public Optional<ProviderId> current() {
        return Optional.ofNullable(providerId);
    }

    void assign(ProviderId providerId) {
        this.providerId = providerId;
    }

    void clear() {
        this.providerId = null;
    }
}
