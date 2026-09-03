package com.balaaca.platformkernel.tenancy;

import com.balaaca.sharedkernel.ids.StaffId;
import com.balaaca.sharedkernel.ids.UserId;

/**
 * What the platform knows about the caller once the database has answered.
 *
 * <p>Every value comes from one read of {@code provider_staff}, uncached, on
 * every request - which is the whole design premise: a membership held in a
 * token or a cache is a window during which a removed member still has access.
 *
 * <p>The role is here because it was in the database and read by nobody. Every
 * member with an account had full control of the tenant, so an employee could
 * unpublish the storefront and re-price the whole catalogue.
 *
 * <p>The account is here for the audit trail: {@code audit_logs.actor_user_id}
 * references {@code users}, and a staff row is a bookable chair that may carry
 * no account at all - so the two identifiers are not interchangeable.
 */
public record Membership(ProviderId providerId, StaffId staffId, UserId userId,
                         MembershipRole role) {

    public boolean isOwner() {
        return role == MembershipRole.OWNER;
    }
}
