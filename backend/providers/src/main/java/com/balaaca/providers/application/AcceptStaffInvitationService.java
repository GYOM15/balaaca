package com.balaaca.providers.application;

import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.platformkernel.ratelimit.AttemptLimiter;
import com.balaaca.platformkernel.ratelimit.TooManyAttemptsException;
import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.providers.ports.inbound.AcceptStaffInvitationUseCase;
import com.balaaca.providers.ports.outbound.StaffInvitationRepository;
import com.balaaca.providers.ports.outbound.StaffJoinedRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Duration;
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

    /**
     * What makes a short code safe, and the only thing that does.
     *
     * <p>V045 cut the access code from 256 bits to about 2^39.6 so an owner
     * could say it out loud. That arithmetic only works against a guesser who
     * is stopped: thirty tries per ten minutes, over the seven days an
     * invitation lives, is roughly one chance in thirty million. Without this
     * the same code is guessable in an afternoon.
     *
     * <p>Keyed on the ACCOUNT attempting, not on the code: a budget per code
     * would let one guesser walk the space by changing what they try, which is
     * exactly what a guesser does.
     */
    private static final int TRIES_PER_WINDOW = 30;
    private static final Duration WINDOW = Duration.ofMinutes(10);
    private static final String KEY_PREFIX = "ratelimit:staff-invitation:";

    private final StaffInvitationRepository invitations;
    private final StaffJoinedRepository joined;
    private final AttemptLimiter attempts;
    private final AuditTrail audit;

    public AcceptStaffInvitationService(StaffInvitationRepository invitations,
                                        StaffJoinedRepository joined,
                                        AttemptLimiter attempts,
                                        AuditTrail audit) {
        this.invitations = invitations;
        this.joined = joined;
        this.attempts = attempts;
        this.audit = audit;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public JoinedProvider accept(String code, Account account) {
        // Spent BEFORE the code is looked at, so a wrong one costs the same as
        // a right one and the budget cannot be probed for free.
        if (!attempts.withinBudget(KEY_PREFIX + account.subject(),
                                   TRIES_PER_WINDOW, WINDOW)) {
            throw new TooManyAttemptsException("accept_staff_invitation");
        }
        ProviderId providerId = invitations.accept(code, account);

        // A platform row: no tenant is bound here, exactly as at signup, so the
        // business joined is in the metadata rather than in provider_id.
        audit.record(new AuditEvent("STAFF_INVITATION_ACCEPTED", "provider_staff",
                Optional.empty(), AuditOutcome.SUCCESS,
                Map.of("provider_id", providerId.toString())));

        return joined.describe(account.subject());
    }
}
