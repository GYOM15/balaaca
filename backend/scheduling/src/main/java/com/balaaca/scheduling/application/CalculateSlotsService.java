package com.balaaca.scheduling.application;

import com.balaaca.scheduling.domain.AvailableSlot;
import com.balaaca.scheduling.domain.BookingPolicy;
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
import java.util.TreeMap;
import java.util.stream.Collectors;

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

    /**
     * What a customer can book.
     *
     * <p>With no staff member named, this is the UNION of what each bookable
     * person can take - computed per person and merged, never pooled.
     *
     * <p>Pooling is what it used to do, and it was wrong in three ways at once:
     * every appointment in the salon was treated as busy for everybody, so one
     * braider booked at ten made the salon unbookable at ten while another chair
     * sat empty; everyone's rules were unioned without merging, so three people
     * on identical hours emitted every slot three times into a paginated list;
     * and one person's day off closed the whole shop. Worst of all, the booking
     * path did not agree - it counts free chairs individually, so it accepted
     * starts this list refused to show, and the customer never found out the
     * slot was there.
     *
     * <p>It costs a few queries per person. A salon has chairs, not thousands of
     * them, and being wrong is not cheaper.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<AvailableSlot> bookable(SlotRequest request) {
        ZoneId zone = availability.zoneOfCurrentProvider();
        BookingPolicy policy = availability.policyOfCurrentProvider();

        if (request.staffId().isPresent()) {
            return slotsFor(request, zone, policy, busyIn(request, zone));
        }

        // Distinct by start: two people free at ten is one slot offered, not
        // two. What the customer is choosing is a time; who takes it is the
        // server's problem, and the booking path resolves it.
        return availability.bookableStaff().stream()
                .map(request::forStaff)
                .flatMap(one -> slotsFor(one, zone, policy, busyIn(one, zone)).stream())
                .collect(Collectors.toMap(AvailableSlot::startsAt, s -> s, (a, b) -> a,
                                          TreeMap::new))
                .values().stream()
                .toList();
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
        BookingPolicy policy = availability.policyOfCurrentProvider();

        if (request.staffId().isPresent()) {
            return SlotCalculator.isBookable(startsAt, queryFor(request, zone, policy, List.of()));
        }

        // ANY bookable person, for the mirror of the reason above: pooling the
        // rules would let two people's hours add up to a window neither of them
        // works, and the appointment would be judged inside availability that
        // belongs to nobody.
        return availability.bookableStaff().stream()
                .anyMatch(staff -> SlotCalculator.isBookable(
                        startsAt, queryFor(request.forStaff(staff), zone, policy, List.of())));
    }

    private List<AvailableSlot> slotsFor(SlotRequest request, ZoneId zone,
                                         BookingPolicy policy, List<InstantRange> busy) {
        return SlotCalculator.bookable(queryFor(request, zone, policy, busy));
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

    private SlotQuery queryFor(SlotRequest request, ZoneId zone, BookingPolicy policy,
                               List<InstantRange> busy) {
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
                policy,
                // Injected, never Instant.now(): a calculation that reads the
                // system clock cannot be tested at a boundary.
                clock.instant());
    }
}
