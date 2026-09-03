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

    /**
     * The caller themselves.
     *
     * <p>Separate from {@link #currentStaff()} rather than a filter over it,
     * because the question is different and so is the answer's failure mode: a
     * caller who is not staff here has no row in that list to be missing from,
     * and the client would read an empty result as "a salon with no people".
     *
     * <p>It exists because a staff identifier was published only by the team
     * listing. That serves an owner and fails an employee, who could read every
     * colleague's identifier and had no way to tell which one was theirs - while
     * every schedule operation asks for exactly that.
     */
    StaffMember currentMember();

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
     * Hands the business to a colleague. The caller stops being the owner in
     * the same statement, which is the point and is why it is not reversible
     * from their side: only the new owner can hand it back.
     *
     * <p>The recipient must already have an account. Handing a business to a
     * chair with no login would leave it owned by somebody nobody can be - the
     * role would resolve for no subject, and the way out would be a migration.
     *
     * @return the team as it now stands, owner first
     * @throws com.balaaca.providers.domain.NotTheOwnerException the caller does
     *         not own this business
     * @throws com.balaaca.providers.domain.CannotOwnException the recipient is
     *         not an active colleague with an account, or is the caller
     */
    List<StaffMember> transferOwnership(StaffId to);

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
