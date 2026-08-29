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
        return SlotCalculator.bookable(queryFor(request));
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public boolean isBookable(Instant startsAt, SlotRequest request) {
        return SlotCalculator.isBookable(startsAt, queryFor(request));
    }

    private SlotQuery queryFor(SlotRequest request) {
        ZoneId zone = availability.zoneOfCurrentProvider();

        // Widened by a day on each side: a window that starts the previous local
        // evening and wraps past midnight still occupies part of the requested
        // range, and an appointment near the boundary still blocks it.
        InstantRange window = new InstantRange(
                request.fromDate().minusDays(1).atStartOfDay(zone).toInstant(),
                request.toDate().plusDays(1).atTime(LocalTime.MAX).atZone(zone).toInstant());

        return new SlotQuery(
                request.fromDate(),
                request.toDate(),
                zone,
                availability.rulesFor(request.staffId()),
                availability.overridesFor(request.staffId(), request.fromDate(), request.toDate()),
                availability.busyRanges(request.staffId(), window),
                request.serviceDuration(),
                request.bufferBefore(),
                request.bufferAfter(),
                availability.policyOfCurrentProvider(),
                // Injected, never Instant.now(): a calculation that reads the
                // system clock cannot be tested at a boundary.
                clock.instant());
    }
}
