package com.balaaca.scheduling.ports.outbound;

import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.Closure;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.WeeklySegment;
import com.balaaca.scheduling.domain.OpenWindow;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Writes what a provider declares. Separate from {@link AvailabilityRepository},
 * which reads it for the calculator: one changes when a provider edits their
 * week, the other when the way slots are computed changes.
 */
public interface AvailabilityAdminRepository {

    boolean staffExists(StaffId staffId);

    List<WeeklySegment> segmentsOf(StaffId staffId);

    /**
     * Every currently-effective rule of every bookable, active staff member,
     * unmerged and in order. What "currently" means is decided by the database
     * against the provider's own timezone: a rule that starts on Monday starts
     * when it is Monday where the shop is, not where the server is.
     */
    List<OpenWindow> effectiveWindows();

    /** Replaces every rule for that staff member, in one transaction. */
    List<WeeklySegment> replaceSegments(StaffId staffId, List<WeeklySegment> segments);

    List<Closure> closures(StaffId staffId, LocalDate from, LocalDate to);

    Closure insertClosure(UUID id, Closure closure);

    /**
     * @param restrictTo when present, only a closure belonging to that staff
     *                   member is deleted. The restriction travels into the
     *                   DELETE rather than being checked after a separate read,
     *                   which would be a window in which the row could change
     *                   hands.
     */
    boolean deleteClosure(UUID id, Optional<StaffId> restrictTo);
}
