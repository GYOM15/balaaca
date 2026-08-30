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

    /** No role: ownership moves through a conversation, not an edit form. */
    record StaffDefinition(String displayName, boolean bookable, boolean active) {
    }

    record StaffMember(StaffId id, String displayName, String role,
                       boolean bookable, boolean active) {
    }
}
