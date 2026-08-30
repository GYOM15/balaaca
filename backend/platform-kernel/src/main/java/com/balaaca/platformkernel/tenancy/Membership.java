package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.ids.StaffId;

/**
 * What the platform knows about the caller once the database has answered.
 *
 * <p>All three values come from one read of {@code provider_staff}, uncached, on
 * every request - which is the whole design premise: a membership held in a
 * token or a cache is a window during which a removed member still has access.
 *
 * <p>The role is here because it was in the database and read by nobody. Every
 * member with an account had full control of the tenant, so an employee could
 * unpublish the storefront and re-price the whole catalogue.
 */
public record Membership(ProviderId providerId, StaffId staffId, MembershipRole role) {

    public boolean isOwner() {
        return role == MembershipRole.OWNER;
    }
}
