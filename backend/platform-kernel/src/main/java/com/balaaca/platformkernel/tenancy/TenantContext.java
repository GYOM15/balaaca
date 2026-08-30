package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.RequestScoped;
import java.util.Optional;

/**
 * The tenant bound to the current request, and who bound it.
 *
 * <p>Two things arrive here by two different routes, and keeping them apart is
 * the point. Staff arrive with a {@link Membership} - a provider, a person and a
 * role, all read from the database on this request. A customer on the public
 * path arrives with a tenant and nothing else: they are not staff, they have no
 * role, and asking whether they own the business must refuse rather than guess.
 *
 * <p>{@code assign} and {@code clear} are package-private on purpose: business
 * code that could set the tenant could also change it.
 */
@RequestScoped
public class TenantContext {

    private ProviderId providerId;
    private Membership membership;

    /** The bound tenant. Throws when nothing resolved, which is the safe default. */
    public ProviderId require() {
        if (providerId == null) {
            throw new NoProviderMembershipException(null);
        }
        return providerId;
    }

    /** Which of the provider's people is calling. Never a customer. */
    public StaffId requireStaffId() {
        return requireMembership().staffId();
    }

    /**
     * Refuses anyone but the owner.
     *
     * <p>Checked in the service layer rather than only at the edge, which is
     * what the published contract has always claimed happens and what nothing
     * did. The action is named for the audit trail and never reaches the caller.
     */
    public void requireOwner(String action) {
        if (!requireMembership().isOwner()) {
            throw new NotProviderOwnerException(action);
        }
    }

    public boolean isOwner() {
        return requireMembership().isOwner();
    }

    /**
     * The bound tenant if there is one. Exists for the connection hook, which
     * runs on transactions that legitimately have no tenant - a migration, a
     * readiness probe, the notification drain.
     */
    public Optional<ProviderId> current() {
        return Optional.ofNullable(providerId);
    }

    private Membership requireMembership() {
        if (membership == null) {
            // A customer, or nothing bound at all. Both are "not staff here".
            throw new NoProviderMembershipException(null);
        }
        return membership;
    }

    void assign(Membership resolved) {
        this.membership = resolved;
        this.providerId = resolved.providerId();
    }

    /** The public path: a tenant, and deliberately no membership behind it. */
    void assign(ProviderId publishedProvider) {
        this.membership = null;
        this.providerId = publishedProvider;
    }

    void clear() {
        this.membership = null;
        this.providerId = null;
    }
}
