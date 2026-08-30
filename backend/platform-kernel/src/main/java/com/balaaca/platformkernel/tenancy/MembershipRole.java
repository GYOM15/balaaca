package com.balaaca.platformkernel.tenancy;

/**
 * What a member may do inside their own provider.
 *
 * <p>Two levels and no more, deliberately. A finer scheme needs someone to
 * administer it, and a salon with four chairs has nobody to spare for that. The
 * line drawn is the one that matters: who may change what the public sees and
 * who works here.
 */
public enum MembershipRole {

    /** Registration's own row. Exactly one per provider. */
    OWNER,
    STAFF;

    public static MembershipRole of(String stored) {
        return "OWNER".equals(stored) ? OWNER : STAFF;
    }
}
