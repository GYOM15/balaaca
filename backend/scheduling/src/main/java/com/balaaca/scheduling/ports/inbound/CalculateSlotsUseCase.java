package com.balaaca.scheduling.ports.inbound;

import com.balaaca.scheduling.domain.AvailableSlot;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * What scheduling publishes to the rest of the core: which slots are bookable,
 * and whether one particular start is.
 *
 * <p>Both answers come from the same calculation. A separate validation path
 * would drift, and the two disagreeing is exactly how an API ends up rejecting
 * a slot it had just offered.
 */
public interface CalculateSlotsUseCase {

    List<AvailableSlot> bookable(SlotRequest request);

    boolean isBookable(Instant startsAt, SlotRequest request);

    /**
     * @param staffId empty means any bookable staff member; the availability of
     *                the whole team is considered
     */
    record SlotRequest(
            ServiceOfferingId serviceOfferingId,
            Optional<StaffId> staffId,
            LocalDate fromDate,
            LocalDate toDate,
            Duration serviceDuration,
            Duration bufferBefore,
            Duration bufferAfter) {
    }
}
