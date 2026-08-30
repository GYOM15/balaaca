package com.balaaca.app.rest;

import com.balaaca.app.api.TeamApi;
import com.balaaca.app.api.model.StaffInvitationView;
import com.balaaca.app.api.model.StaffList;
import com.balaaca.app.api.model.StaffRequest;
import com.balaaca.app.api.model.StaffView;
import com.balaaca.platformkernel.tenancy.TenantBound;
import com.balaaca.providers.ports.inbound.ListStaffUseCase;
import com.balaaca.providers.ports.inbound.ListStaffUseCase.StaffDefinition;
import com.balaaca.providers.ports.inbound.ListStaffUseCase.StaffMember;
import com.balaaca.sharedkernel.ids.StaffId;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.core.Response;
import java.util.UUID;

/**
 * The people who work at the caller's own business.
 *
 * <p>No provider identifier: the tenant is ambient, and a staff identifier is
 * one of the caller's own people, which the database confines to them.
 *
 * <p>There is no delete, and that is a decision rather than an omission. A
 * member who has left becomes inactive; removing the row would take their
 * appointments' history with it, and the provider would lose the record of who
 * saw which customer.
 */
@Authenticated
@TenantBound
public class TeamResource implements TeamApi {

    private final ListStaffUseCase staff;

    public TeamResource(ListStaffUseCase staff) {
        this.staff = staff;
    }

    @Override
    @RolesAllowed("dashboard:read")
    public Response listStaff() {
        return Response.ok(new StaffList().data(
                staff.currentStaff().stream().map(TeamResource::view).toList())).build();
    }

    @Override
    @RolesAllowed("staff:write")
    public Response addStaffMember(StaffRequest request) {
        return Response.status(201).entity(view(staff.add(definition(request)))).build();
    }

    @Override
    @RolesAllowed("staff:write")
    public Response replaceStaffMember(UUID id, StaffRequest request) {
        return Response.ok(view(staff.replace(StaffId.of(id), definition(request)))).build();
    }

    @Override
    @RolesAllowed("staff:write")
    public Response inviteStaffMember(UUID id) {
        var invitation = staff.invite(StaffId.of(id));
        return Response.status(201).entity(new StaffInvitationView()
                .code(invitation.code())
                .expiresAt(java.time.OffsetDateTime.ofInstant(
                        invitation.expiresAt(), java.time.ZoneOffset.UTC)))
                .build();
    }

    private static StaffDefinition definition(StaffRequest request) {
        return new StaffDefinition(request.getDisplayName(),
                                   Boolean.TRUE.equals(request.getBookable()),
                                   Boolean.TRUE.equals(request.getActive()));
    }

    private static StaffView view(StaffMember member) {
        return new StaffView()
                .staffId(member.id().value())
                .displayName(member.displayName())
                .role(member.role())
                .bookable(member.bookable())
                .active(member.active());
    }
}
