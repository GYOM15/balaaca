package com.balaaca.scheduling.application;

import com.balaaca.scheduling.domain.AvailableSlot;
import com.balaaca.scheduling.domain.InstantRange;
import com.balaaca.scheduling.domain.SlotCalculator;
import com.balaaca.scheduling.domain.SlotQuery;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase;
import com.balaaca.scheduling.ports.outbound.AvailabilityRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

/**
 * Gathers what the calculation needs and hands it to a pure function.
 *
 * <p>Transactional even though it only reads. The RLS session variable is set
 * with {@code is_local = true}, so outside a transaction it lasts a single
 * statement and every following query runs with no tenant bound - returning
 * nothing, which reads as "this provider has no hours" rather than failing.
 */
@ApplicationScoped
public class CalculateSlotsService implements CalculateSlotsUseCase {

    private final AvailabilityRepository availability;
    private final Clock clock;

    public CalculateSlotsService(AvailabilityRepository availability, Clock clock) {
        this.availability = availability;
        this.clock = clock;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<AvailableSlot> bookable(SlotRequest request) {
        ZoneId zone = availability.zoneOfCurrentProvider();
        return SlotCalculator.bookable(queryFor(request, zone, busyIn(request, zone)));
    }

    /**
     * Answered with no busy ranges, deliberately.
     *
     * <p>Whether a slot is still free is the exclusion constraint's answer, and
     * only it can give that answer correctly: it is taken inside the INSERT,
     * where two racing bookings are ordered. Consulting the busy ranges here
     * would move it earlier and get it wrong twice - a slot merely taken would
     * be reported as outside the provider's declared hours, and a retry of a
     * booking that already succeeded would be refused by the very row it
     * created.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public boolean isWithinAvailability(Instant startsAt, SlotRequest request) {
        ZoneId zone = availability.zoneOfCurrentProvider();
        return SlotCalculator.isBookable(startsAt, queryFor(request, zone, List.of()));
    }

    /**
     * Widened by a day on each side: a window that starts the previous local
     * evening and wraps past midnight still occupies part of the requested
     * range, and an appointment near the boundary still blocks it.
     */
    private List<InstantRange> busyIn(SlotRequest request, ZoneId zone) {
        InstantRange window = new InstantRange(
                request.fromDate().minusDays(1).atStartOfDay(zone).toInstant(),
                request.toDate().plusDays(1).atTime(LocalTime.MAX).atZone(zone).toInstant());
        return availability.busyRanges(request.staffId(), window);
    }

    private SlotQuery queryFor(SlotRequest request, ZoneId zone, List<InstantRange> busy) {
        return new SlotQuery(
                request.fromDate(),
                request.toDate(),
                zone,
                availability.rulesFor(request.staffId()),
                availability.overridesFor(request.staffId(), request.fromDate(), request.toDate()),
                busy,
                request.serviceDuration(),
                request.bufferBefore(),
                request.bufferAfter(),
                availability.policyOfCurrentProvider(),
                // Injected, never Instant.now(): a calculation that reads the
                // system clock cannot be tested at a boundary.
                clock.instant());
    }
}
