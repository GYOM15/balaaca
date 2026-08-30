package com.balaaca.providers.application;

import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase;
import com.balaaca.providers.ports.outbound.StaffInvitationRepository;
import com.balaaca.providers.ports.outbound.StaffJoinedRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.Map;
import java.util.Optional;

/**
 * Joining a team that invited you.
 *
 * <p>One transaction, and no tenant bound in it: the caller has no membership
 * until this succeeds, which is the whole reason it goes through a SECURITY
 * DEFINER function rather than an ordinary write.
 *
 * <p>Reading back what was joined is a second statement rather than something
 * the function returns, because it needs the provider bound - and after the
 * redemption it is, through the ordinary resolution path, on the caller's next
 * request. Here it is read as a platform-level lookup by id.
 */
@ApplicationScoped
public class AcceptStaffInvitationService implements AcceptStaffInvitationUseCase {

    private final StaffInvitationRepository invitations;
    private final StaffJoinedRepository joined;
    private final AuditTrail audit;

    public AcceptStaffInvitationService(StaffInvitationRepository invitations,
                                        StaffJoinedRepository joined,
                                        AuditTrail audit) {
        this.invitations = invitations;
        this.joined = joined;
        this.audit = audit;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public JoinedProvider accept(String code, Account account) {
        ProviderId providerId = invitations.accept(code, account);

        // A platform row: no tenant is bound here, exactly as at signup, so the
        // business joined is in the metadata rather than in provider_id.
        audit.record(new AuditEvent("STAFF_INVITATION_ACCEPTED", "provider_staff",
                Optional.empty(), AuditOutcome.SUCCESS,
                Map.of("provider_id", providerId.toString())));

        return joined.describe(account.subject());
    }
}
