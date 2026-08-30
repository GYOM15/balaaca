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
 * and whether one particular start is inside the declared availability.
 *
 * <p>Both answers come from the same calculation. A separate validation path
 * would drift, and the two disagreeing is exactly how an API ends up rejecting
 * a slot it had just offered.
 */
public interface CalculateSlotsUseCase {

    List<AvailableSlot> bookable(SlotRequest request);

    /**
     * Whether one start is inside what the provider declared - hours, overrides,
     * slot granularity, lead time and booking horizon.
     *
     * <p>It deliberately does not ask whether the slot is still free. That is
     * the exclusion constraint's answer, given inside the INSERT where two
     * racing bookings can be told apart; asking it here would report a taken
     * slot as outside the provider's hours, and would re-judge a retry that
     * only ever wanted its original booking back.
     */
    boolean isWithinAvailability(Instant startsAt, SlotRequest request);

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
