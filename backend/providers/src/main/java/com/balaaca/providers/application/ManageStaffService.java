package com.balaaca.providers.application;

import com.balaaca.providers.domain.NotInvitableException;
import com.balaaca.providers.domain.NothingToPublishException;
import com.balaaca.providers.domain.StaffNotFoundException;
import com.balaaca.providers.ports.inbound.ListStaffUseCase;
import com.balaaca.providers.ports.outbound.ProviderProfileRepository;
import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.providers.ports.outbound.StaffRepository;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

/**
 * The caller's own team.
 *
 * <p>One rule lives here rather than in the adapter, and it is the mirror of the
 * publish gate: a page already on the public path can be emptied after the fact.
 * Standing down the last bookable person leaves a published business whose
 * opening hours are computed from nobody, so a customer finds the page, finds no
 * slots, and does not come back. Refused while the provider can still see why.
 *
 * <p>Deliberately not refused when the business is unpublished: a salon
 * reorganising its team should not have to fight the platform, and nothing is
 * visible to anyone until it publishes again.
 *
 * <p>Reading the team is open to every member - they work together. Changing it
 * is the owner's, because a member who could add a bookable person could hand
 * out that person's slots, and one who could stand someone down could empty a
 * colleague's diary.
 */
@ApplicationScoped
public class ManageStaffService implements ListStaffUseCase {

    /** Long enough to find a moment, short enough that a stale code stops working. */
    private static final Duration INVITATION_VALID_FOR = Duration.ofDays(7);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final StaffRepository staff;
    private final ProviderProfileRepository profiles;
    private final TenantContext tenant;
    private final AuditTrail audit;
    private final Clock clock;

    public ManageStaffService(StaffRepository staff, ProviderProfileRepository profiles,
                              TenantContext tenant, AuditTrail audit, Clock clock) {
        this.staff = staff;
        this.profiles = profiles;
        this.tenant = tenant;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<StaffMember> currentStaff() {
        return staff.currentStaff();
    }

    /**
     * The caller's own row, found through the membership the request already
     * resolved rather than through anything the caller sent.
     *
     * <p>A miss here would mean the membership resolver and this table disagree
     * within one request, which is not a caller's mistake to be told about.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public StaffMember currentMember() {
        StaffId me = tenant.requireStaffId();
        return staff.byId(me).orElseThrow(() -> new StaffNotFoundException(me.value()));
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public StaffMember add(StaffDefinition definition) {
        // Who works here is the owner's decision. Left open, any member could
        // add a bookable person and hand out that person's slots.
        tenant.requireOwner("add_staff_member");
        StaffMember added = staff.insert(definition);
        audit.record(AuditEvent.success("STAFF_MEMBER_ADDED", "provider_staff",
                                        added.id().toString()));
        return added;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public StaffMember replace(StaffId id, StaffDefinition definition) {
        tenant.requireOwner("replace_staff_member");
        if (!isBookableByCustomers(definition) && wouldLeaveNobody(id)) {
            throw new NothingToPublishException("nobody bookable would be left");
        }
        StaffMember changed = staff.update(id, definition)
                .orElseThrow(() -> new StaffNotFoundException(id.value()));

        // Both flags, because they are two different decisions with the same
        // effect on a customer: someone stood down and someone kept on but not
        // bookable both disappear from the public list.
        audit.record(new AuditEvent("STAFF_MEMBER_CHANGED", "provider_staff",
                java.util.Optional.of(id.toString()), AuditOutcome.SUCCESS,
                java.util.Map.of("active", String.valueOf(changed.active()),
                                 "bookable", String.valueOf(changed.bookable()))));

        return changed;
    }

    /**
     * Mints a code for a member who should be able to sign in.
     *
     * <p>Owner-only, like everything else about who works here. The conditions
     * live in the UPDATE rather than around it, so this reads the answer rather
     * than deciding it: a member who already has an account, or the owner's own
     * row, matches nothing.
     *
     * <p>Seven days. Long enough for someone to find a moment to sign up, short
     * enough that a code left in a message thread stops working.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public StaffInvitation invite(StaffId id) {
        tenant.requireOwner("invite_staff_member");

        String code = mintCode();
        Instant expiresAt = clock.instant().plus(INVITATION_VALID_FOR);

        if (!staff.issueInvitation(id, code, expiresAt)) {
            // Two different answers, and the difference matters to an owner: a
            // member who is not there at all, and one who is there and cannot
            // be invited.
            throw staff.exists(id)
                    ? new NotInvitableException("they already have an account, or own this business")
                    : new StaffNotFoundException(id.value());
        }

        audit.record(AuditEvent.success("STAFF_INVITED", "provider_staff", id.toString()));
        return new StaffInvitation(code, expiresAt);
    }

    /**
     * 256 bits, like a booking reference and for the same reason: it is the
     * whole authorisation for a seat at a business, and it is not derived from
     * anything a guesser could know.
     */
    private static String mintCode() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    /** Active and bookable are two different things, and both are required. */
    private static boolean isBookableByCustomers(StaffDefinition definition) {
        return definition.active() && definition.bookable();
    }

    private boolean wouldLeaveNobody(StaffId id) {
        return profiles.current().published() && staff.otherBookableStaff(id) == 0;
    }
}
