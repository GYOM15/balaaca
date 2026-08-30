package com.balaaca.providers.ports.inbound;

import com.balaaca.sharedkernel.ids.StaffId;
import java.util.List;

/**
 * The caller's own people, read and written.
 *
 * <p>Published because a schedule belongs to a person: a salon where one stylist
 * works Saturdays and another does not is the normal case, so anything setting
 * hours has to be able to say whose.
 *
 * <p>A member is a bookable resource, not an account. A salon adds a chair and
 * the person who works it long before that person signs in, and many never
 * will, so nothing here creates a login.
 */
public interface ListStaffUseCase {

    List<StaffMember> currentStaff();

    StaffMember add(StaffDefinition definition);

    /**
     * The whole member. There is no delete: someone who has left is inactive,
     * because a row removed would take their appointments' history with it.
     *
     * @throws com.balaaca.providers.domain.NothingToPublishException standing
     *         down the last bookable person at a published business
     */
    StaffMember replace(StaffId id, StaffDefinition definition);

    /**
     * Mints a code that lets this member sign in.
     *
     * <p>A member is a bookable chair and most never sign in. This is for the
     * ones who should - and it is the write that was missing: nothing but
     * registration ever put an account on a staff row, so the STAFF role drawn
     * by V015 was unreachable outside a test fixture.
     *
     * @throws com.balaaca.providers.domain.StaffNotFoundException no such member
     * @throws com.balaaca.providers.domain.NotInvitableException already has an
     *         account, or is the owner
     */
    StaffInvitation invite(StaffId id);

    /** Returned once. Issuing another replaces it, which is also how to revoke. */
    record StaffInvitation(String code, java.time.Instant expiresAt) {
    }

    /** No role: ownership moves through a conversation, not an edit form. */
    record StaffDefinition(String displayName, boolean bookable, boolean active) {
    }

    record StaffMember(StaffId id, String displayName, String role,
                       boolean bookable, boolean active) {
    }
}
