package com.balaaca.app.rest;

import com.balaaca.app.api.InvitationsApi;
import com.balaaca.app.api.model.JoinedProviderView;
import com.balaaca.platformkernel.tenancy.AuthenticatedSubject;
import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase;
import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase.Account;
import io.quarkus.security.Authenticated;
import jakarta.ws.rs.core.Response;

/**
 * Joining a team that invited you.
 *
 * <p>The second resource on this platform that is {@code @Authenticated} and
 * deliberately NOT {@code @TenantBound}, and for the same reason as the first:
 * the caller has no membership until this succeeds, so binding one beforehand
 * would refuse exactly the person it exists for.
 *
 * <p>It declares no scope. A scope says what a caller may do inside their own
 * provider, and they do not have one yet.
 */
@Authenticated
public class InvitationsResource implements InvitationsApi {

    private final AuthenticatedSubject caller;
    private final AcceptStaffInvitationUseCase invitations;

    public InvitationsResource(AuthenticatedSubject caller,
                               AcceptStaffInvitationUseCase invitations) {
        this.caller = caller;
        this.invitations = invitations;
    }

    @Override
    public Response acceptStaffInvitation(String code) {
        // Who the caller is comes from the verified token, never from the body.
        // The name they are given is the one the owner wrote on the chair.
        var joined = invitations.accept(code, new Account(
                caller.require(), caller.displayName(), caller.email()));

        return Response.ok(new JoinedProviderView()
                .providerSlug(joined.providerSlug())
                .businessName(joined.businessName())
                .displayName(joined.displayName())
                .role(JoinedProviderView.RoleEnum.STAFF))
                .build();
    }
}
