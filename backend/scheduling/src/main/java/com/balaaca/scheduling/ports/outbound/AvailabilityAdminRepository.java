package com.balaaca.scheduling.ports.outbound;

import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.Closure;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.WeeklySegment;
import com.balaaca.sharedkernel.ids.StaffId;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Writes what a provider declares. Separate from {@link AvailabilityRepository},
 * which reads it for the calculator: one changes when a provider edits their
 * week, the other when the way slots are computed changes.
 */
public interface AvailabilityAdminRepository {

    boolean staffExists(StaffId staffId);

    List<WeeklySegment> segmentsOf(StaffId staffId);

    /** Replaces every rule for that staff member, in one transaction. */
    List<WeeklySegment> replaceSegments(StaffId staffId, List<WeeklySegment> segments);

    List<Closure> closures(StaffId staffId, LocalDate from, LocalDate to);

    Closure insertClosure(UUID id, Closure closure);

    boolean deleteClosure(UUID id);
}
