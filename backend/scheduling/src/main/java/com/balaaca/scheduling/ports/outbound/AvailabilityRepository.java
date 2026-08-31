package com.balaaca.scheduling.ports.outbound;

import com.balaaca.scheduling.domain.AvailabilityOverride;
import com.balaaca.scheduling.domain.AvailabilityRule;
import com.balaaca.scheduling.domain.BookingPolicy;
import com.balaaca.scheduling.domain.InstantRange;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

public interface AvailabilityRepository {

    /** The provider's zone. Opening hours are meaningless without it. */
    ZoneId zoneOfCurrentProvider();

    BookingPolicy policyOfCurrentProvider();

    /**
     * Who could take a booking at all: active and bookable.
     *
     * <p>Needed because "any available staff" is the UNION of what each person
     * can take, and a union has to be computed per person. Asking the database
     * for everyone's rules at once and calculating on the pile answers a
     * different question - it treats the salon as one calendar, so one busy
     * chair closes the shop.
     */
    List<StaffId> bookableStaff();

    List<AvailabilityRule> rulesFor(Optional<StaffId> staffId);

    List<AvailabilityOverride> overridesFor(Optional<StaffId> staffId, LocalDate from, LocalDate to);

    /**
     * The stored blocked ranges of active appointments in the window, already
     * inclusive of each appointment's own frozen buffers. The calculator must
     * not widen them again.
     */
    List<InstantRange> busyRanges(Optional<StaffId> staffId, InstantRange window);
}
