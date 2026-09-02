package com.balaaca.providers.application;

import com.balaaca.catalog.ports.inbound.ManageServiceCompetenceUseCase;
import com.balaaca.providers.domain.NotInvitableException;
import com.balaaca.providers.domain.NothingToPublishException;
import com.balaaca.providers.domain.NotTheOwnerException;
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
    private final ManageServiceCompetenceUseCase competences;
    private final ProviderProfileRepository profiles;
    private final TenantContext tenant;
    private final AuditTrail audit;
    private final Clock clock;

    public ManageStaffService(StaffRepository staff,
                              ManageServiceCompetenceUseCase competences,
                              ProviderProfileRepository profiles,
                              TenantContext tenant, AuditTrail audit, Clock clock) {
        this.staff = staff;
        this.competences = competences;
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

        // A new colleague can do everything the shop offers, until the provider
        // says otherwise. Competence is strict, so without this grant a hire
        // would be bookable for nothing and the owner would have to open a
        // second screen before their first appointment.
        competences.grantWholeCatalogue(added.id());
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
     * The digits and the upper-case letters with 0, O, 1, I and L removed: the
     * characters a person hears wrong and reads wrong are not in it. The same
     * thirty-one a booking reference is drawn from.
     */
    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    /**
     * Eight, where a booking reference takes six. That one authorises reading
     * one appointment; this one authorises joining a team, and two more symbols
     * are 961 times the work for a guesser at no cost to the person saying it.
     */
    private static final int CODE_LENGTH = 8;

    /**
     * A code the owner can say out loud.
     *
     * <p>It was 43 characters of base64url - 256 bits, sized as the
     * authorisation it is. But it is also the thing an owner reads across a
     * salon or into WhatsApp, and at that length in mixed case it cannot be.
     *
     * <p>What replaces it is 2^39.6, and that is only defensible because the
     * invitation expires in seven days AND because acceptStaffInvitation spends
     * an attempt budget before it reaches the database. Thirty tries per ten
     * minutes over seven days is about one chance in thirty million. Remove the
     * limiter and this becomes guessable in an afternoon - V045 says the same
     * thing beside the SQL.
     */
    private String mintCode() {
        StringBuilder body = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            body.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return profiles.initials() + "-" + body;
    }

    /** Active and bookable are two different things, and both are required. */
    private static boolean isBookableByCustomers(StaffDefinition definition) {
        return definition.active() && definition.bookable();
    }

    private boolean wouldLeaveNobody(StaffId id) {
        return profiles.current().published() && staff.otherBookableStaff(id) == 0;
    }
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<StaffMember> transferOwnership(StaffId to) {
        // Checked here as well as in the function, so the refusal is a sentence
        // rather than a SQLSTATE: the caller is a member of this business and
        // knows it, and what they lack is the standing to give it away.
        tenant.requireOwner("transfer_ownership");

        StaffId from = tenant.requireStaffId();
        List<StaffMember> team = staff.transferOwnership(from, to);
        if (team.isEmpty()) {
            throw new NotTheOwnerException();
        }

        // The one entry on this trail nobody will reconstruct from memory: who
        // owned the business before, and who owns it now.
        audit.record(new AuditEvent("OWNERSHIP_TRANSFERRED", "provider_staff",
                java.util.Optional.of(to.toString()), AuditOutcome.SUCCESS,
                java.util.Map.of("from", from.toString(), "to", to.toString())));

        return team;
    }

}
