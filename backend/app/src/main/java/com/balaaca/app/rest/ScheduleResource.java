package com.balaaca.app.rest;

import com.balaaca.app.api.ScheduleApi;
import com.balaaca.app.api.model.ClosureKind;
import com.balaaca.app.api.model.ClosureList;
import com.balaaca.app.api.model.ClosureRequest;
import com.balaaca.app.api.model.ClosureView;
import com.balaaca.app.api.model.OpeningHours;
import com.balaaca.app.api.model.OpeningHoursRequest;
import com.balaaca.app.api.model.OpeningHoursSegment;
import com.balaaca.app.api.model.StaffList;
import com.balaaca.app.api.model.StaffView;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.providers.ports.inbound.ListStaffUseCase;
import com.balaaca.providers.ports.inbound.LookupProviderProfileUseCase;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.Closure;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.LocalTimeRange;
import com.balaaca.scheduling.ports.inbound.ManageAvailabilityUseCase.WeeklySegment;
import com.balaaca.sharedkernel.ids.StaffId;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * When the provider is open, and when they are not.
 *
 * <p>Times on this surface are LOCAL and the response says in which zone. A
 * local time with no zone is not a moment, and a recurring rule stored as an
 * instant would drift the day a zone changes its offset - which is why the rules
 * are local in the database too, and why the calculator is the only thing that
 * turns them into instants.
 */
@Authenticated
@TenantBound
public class ScheduleResource implements ScheduleApi {

    private final ListStaffUseCase staff;
    private final LookupProviderProfileUseCase providers;
    private final ManageAvailabilityUseCase availability;

    public ScheduleResource(ListStaffUseCase staff,
                            LookupProviderProfileUseCase providers,
                            ManageAvailabilityUseCase availability) {
        this.staff = staff;
        this.providers = providers;
        this.availability = availability;
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listStaff() {
        return Response.ok(new StaffList().data(staff.currentStaff().stream()
                .map(m -> new StaffView()
                        .staffId(m.id().value())
                        .displayName(m.displayName())
                        .role(m.role())
                        .bookable(m.bookable())
                        .active(m.active()))
                .toList())).build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listOpeningHours(UUID staffId) {
        return Response.ok(hoursOf(StaffId.of(staffId),
                availability.openingHours(StaffId.of(staffId)))).build();
    }

    @Override
    @RolesAllowed("schedule:write")
    public Response replaceOpeningHours(OpeningHoursRequest request) {
        StaffId staffId = StaffId.of(request.getStaffId());
        List<WeeklySegment> replaced = availability.replaceOpeningHours(
                staffId,
                Optional.ofNullable(request.getData()).orElse(List.of()).stream()
                        .map(ScheduleResource::toSegment)
                        .toList());

        return Response.ok(hoursOf(staffId, replaced)).build();
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listClosures(UUID staffId, LocalDate from, LocalDate to) {
        return Response.ok(new ClosureList().data(
                availability.closures(StaffId.of(staffId), from, to).stream()
                        .map(ScheduleResource::toView)
                        .toList())).build();
    }

    @Override
    @RolesAllowed("schedule:write")
    public Response createClosure(ClosureRequest request) {
        return Response.status(201).entity(toView(availability.addClosure(toClosure(request))))
                .build();
    }

    @Override
    @RolesAllowed("schedule:write")
    public Response deleteClosure(UUID id) {
        availability.removeClosure(id);
        return Response.noContent().build();
    }

    private OpeningHours hoursOf(StaffId staffId, List<WeeklySegment> segments) {
        return new OpeningHours()
                .staffId(staffId.value())
                .timezone(providers.currentProfile().timezone().getId())
                .data(segments.stream().map(ScheduleResource::toView).toList());
    }

    private static WeeklySegment toSegment(OpeningHoursSegment s) {
        return new WeeklySegment(
                s.getDayOfWeek(),
                LocalTime.parse(s.getStartTime()),
                LocalTime.parse(s.getEndTime()),
                Optional.ofNullable(s.getEffectiveFrom()),
                Optional.ofNullable(s.getEffectiveTo()));
    }

    private static OpeningHoursSegment toView(WeeklySegment s) {
        return new OpeningHoursSegment()
                .dayOfWeek(s.dayOfWeek())
                .startTime(s.start().toString())
                .endTime(s.end().toString())
                .effectiveFrom(s.effectiveFrom().orElse(null))
                .effectiveTo(s.effectiveTo().orElse(null));
    }

    /**
     * The shape is decided here as well as by the CHECK, because the message
     * matters: a constraint name tells a provider nothing about what they got
     * wrong, and this one is easy to get wrong.
     */
    private static Closure toClosure(ClosureRequest r) {
        boolean custom = r.getKind() == ClosureKind.CUSTOM_HOURS;
        boolean hasTimes = r.getStartTime() != null && r.getEndTime() != null;
        if (custom != hasTimes) {
            throw new MalformedClosure();
        }
        return new Closure(
                Optional.empty(),
                StaffId.of(r.getStaffId()),
                r.getDate(),
                custom ? Optional.of(new LocalTimeRange(LocalTime.parse(r.getStartTime()),
                                                        LocalTime.parse(r.getEndTime())))
                       : Optional.empty(),
                Optional.ofNullable(r.getReason()));
    }

    /**
     * The edge's own refusal, for a disagreement that only exists on the wire:
     * the domain's Closure carries an Optional window, so a closed day with
     * times is unrepresentable inward of here and there is nothing for the use
     * case to reject.
     */
    static final class MalformedClosure extends com.balaaca.sharedkernel.error.DomainException {
        MalformedClosure() {
            super("VALIDATION_FAILED", 400,
                  "A closed day carries no times, and custom hours need both",
                  java.util.Map.of());
        }
    }

    private static ClosureView toView(Closure c) {
        return new ClosureView()
                .closureId(c.id().orElse(null))
                .staffId(c.staffId().value())
                .date(c.date())
                .kind(c.window().isPresent() ? ClosureKind.CUSTOM_HOURS : ClosureKind.CLOSED)
                .startTime(c.window().map(w -> w.start().toString()).orElse(null))
                .endTime(c.window().map(w -> w.end().toString()).orElse(null))
                .reason(c.reason().orElse(null));
    }
}
