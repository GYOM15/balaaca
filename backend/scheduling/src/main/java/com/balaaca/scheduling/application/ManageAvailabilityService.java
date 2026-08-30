package com.balaaca.scheduling.application;

import com.balaaca.scheduling.domain.AvailabilityExceptions.ClosureNotFoundException;
import com.balaaca.scheduling.domain.AvailabilityExceptions.EmptyWindowException;
import com.balaaca.scheduling.domain.AvailabilityExceptions.UnknownStaffException;
import com.balaaca.scheduling.domain.OpenWindow;
import com.balaaca.scheduling.domain.OpeningWeek;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.scheduling.ports.outbound.AvailabilityAdminRepository;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The provider's declared week, read and written.
 *
 * <p>Transactional throughout, reads included: the tenant reaches PostgreSQL as
 * a SET LOCAL and is discarded outside a transaction, so a read would run with
 * no tenant bound and return nothing - which looks like a provider who declared
 * no hours at all.
 */
@ApplicationScoped
public class ManageAvailabilityService implements ManageAvailabilityUseCase {

    private final AvailabilityAdminRepository availability;
    private final TenantContext tenant;

    public ManageAvailabilityService(AvailabilityAdminRepository availability,
                                     TenantContext tenant) {
        this.availability = availability;
        this.tenant = tenant;
    }

    /**
     * Reading a colleague's week is ordinary - people who work together need to
     * see the shop's coverage. Writing it is not: a member who could replace
     * anyone's hours could empty a colleague's diary, or open one on a day that
     * person does not work and hand a customer an appointment nobody will keep.
     */
    private void requireOwnScheduleOrOwner(StaffId staffId, String action) {
        if (!tenant.isOwner() && !tenant.requireStaffId().equals(staffId)) {
            throw new com.balaaca.platformkernel.tenancy.NotProviderOwnerException(action);
        }
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<WeeklySegment> openingHours(StaffId staffId) {
        requireStaff(staffId);
        return availability.segmentsOf(staffId);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<OpenWindow> combinedOpeningHours() {
        return OpeningWeek.merge(availability.effectiveWindows());
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<WeeklySegment> replaceOpeningHours(StaffId staffId, List<WeeklySegment> segments) {
        requireStaff(staffId);
        requireOwnScheduleOrOwner(staffId, "replace_opening_hours");
        // Refused here as well as by the CHECK, because the message matters: a
        // constraint name tells a provider nothing about which day they broke.
        segments.stream()
                .filter(s -> s.start().equals(s.end()))
                .findFirst()
                .ifPresent(s -> {
                    throw new EmptyWindowException(s.dayOfWeek());
                });
        return availability.replaceSegments(staffId, segments);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<Closure> closures(StaffId staffId, LocalDate from, LocalDate to) {
        requireStaff(staffId);
        return availability.closures(staffId, from, to);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Closure addClosure(Closure closure) {
        requireStaff(closure.staffId());
        requireOwnScheduleOrOwner(closure.staffId(), "add_closure");
        closure.window()
                .filter(w -> w.start().equals(w.end()))
                .ifPresent(w -> {
                    throw new EmptyWindowException(closure.date().getDayOfWeek().getValue());
                });
        return availability.insertClosure(UUID.randomUUID(), closure);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public void removeClosure(UUID closureId) {
        // The closure names no staff member in the request, so the restriction
        // travels into the DELETE itself rather than being checked after a
        // separate read - which would be a window in which the row could move.
        Optional<StaffId> restrictTo = tenant.isOwner()
                ? Optional.empty()
                : Optional.of(tenant.requireStaffId());

        if (!availability.deleteClosure(closureId, restrictTo)) {
            // A closure that is not the caller's is invisible to the delete, so
            // it answers as one that never existed.
            throw new ClosureNotFoundException(closureId);
        }
    }

    /**
     * A staff member who is not the caller's is invisible to this read, so it
     * gives the same answer as one who never existed. That is what stops the
     * schedule surface from becoming an oracle for who works where.
     */
    private void requireStaff(StaffId staffId) {
        if (!availability.staffExists(staffId)) {
            throw new UnknownStaffException(staffId.value());
        }
    }
}
