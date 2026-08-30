package com.balaaca.providers.ports.inbound;

import com.balaaca.sharedkernel.ids.StaffId;
import java.util.List;

/**
 * The caller's own people.
 *
 * <p>Published because a schedule belongs to a person: a salon where one stylist
 * works Saturdays and another does not is the normal case, so anything setting
 * hours has to be able to say whose.
 */
public interface ListStaffUseCase {

    List<StaffMember> currentStaff();

    record StaffMember(StaffId id, String displayName, String role,
                       boolean bookable, boolean active) {
    }
}
