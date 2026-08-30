package com.balaaca.scheduling.ports.inbound;

import com.balaaca.sharedkernel.ids.StaffId;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What a provider declares about when they are open.
 *
 * <p>Everything here is LOCAL time. The provider's zone turns it into instants,
 * and that conversion belongs to the calculator - a recurring rule stored as an
 * instant would drift the day a zone changes its offset.
 */
public interface ManageAvailabilityUseCase {

    List<WeeklySegment> openingHours(StaffId staffId);

    /**
     * Replaces the whole week for one staff member.
     *
     * <p>Whole, not day by day: a per-day edit leaves the days nobody mentioned
     * ambiguous, which is how a Saturday gets emptied that no one meant to
     * close.
     */
    List<WeeklySegment> replaceOpeningHours(StaffId staffId, List<WeeklySegment> segments);

    List<Closure> closures(StaffId staffId, LocalDate from, LocalDate to);

    Closure addClosure(Closure closure);

    /**
     * Removes a closure, restoring the weekly hours for that day.
     *
     * <p>Throws rather than returning a boolean the edge would have to
     * interpret: what a missing closure means is this use case's business, and
     * a caller that had to decide could decide differently in two places.
     */
    void removeClosure(UUID closureId);

    /**
     * @param dayOfWeek ISO numbering, 1 is Monday
     * @param end       before start means the window wraps past midnight, which
     *                  a provider open until one in the morning needs
     */
    record WeeklySegment(int dayOfWeek, LocalTime start, LocalTime end,
                         Optional<LocalDate> effectiveFrom, Optional<LocalDate> effectiveTo) {
    }

    /** @param window empty when the day is closed outright */
    record Closure(Optional<UUID> id, StaffId staffId, LocalDate date,
                   Optional<LocalTimeRange> window, Optional<String> reason) {
    }

    record LocalTimeRange(LocalTime start, LocalTime end) {
    }
}
