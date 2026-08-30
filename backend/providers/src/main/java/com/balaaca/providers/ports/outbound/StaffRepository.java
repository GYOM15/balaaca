package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ListStaffUseCase.StaffDefinition;
import com.balaaca.providers.ports.inbound.ListStaffUseCase.StaffMember;
import com.balaaca.sharedkernel.ids.StaffId;
import java.util.List;
import java.util.Optional;

/** The caller's own people. RLS is what confines every one of these. */
public interface StaffRepository {

    List<StaffMember> currentStaff();

    StaffMember insert(StaffDefinition definition);

    /** Empty when no row matched, which is a miss and someone else's alike. */
    Optional<StaffMember> update(StaffId id, StaffDefinition definition);

    /**
     * How many people other than this one a customer could still be given.
     *
     * <p>Counted in the database rather than by filtering a list already read,
     * so the answer cannot drift from what the slot calculator will see.
     */
    long otherBookableStaff(StaffId excluding);

    /**
     * Writes a code onto an unclaimed STAFF row, replacing any it held.
     *
     * <p>The conditions travel into the UPDATE rather than being checked around
     * it: a row that already has an account, or is the owner's, matches nothing
     * and the caller is told so.
     *
     * @return false when no such invitable member exists
     */
    boolean issueInvitation(StaffId id, String code, java.time.Instant expiresAt);

    /** Whether the member exists at all, to tell a 404 from a 409. */
    boolean exists(StaffId id);
}
