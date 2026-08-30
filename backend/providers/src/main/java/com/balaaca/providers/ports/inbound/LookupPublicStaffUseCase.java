package com.balaaca.providers.ports.inbound;

import com.balaaca.sharedkernel.ids.StaffId;
import java.util.List;

/**
 * Who a customer may ask for.
 *
 * <p>A separate projection from {@link ListStaffUseCase}, not the same list with
 * fields removed later. What is absent is absent by shape: the role, so a
 * customer cannot tell the owner from an employee; whether the person is active,
 * because an inactive one simply is not here; and any working pattern, because
 * an individual's week is a fact about a named person.
 *
 * <p>The tenant is bound from a published slug before this is called.
 */
public interface LookupPublicStaffUseCase {

    /** Active and bookable only, in a stable order. */
    List<BookableStaff> bookableStaff();

    record BookableStaff(StaffId id, String displayName) {
    }
}
