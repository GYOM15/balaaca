package com.balaaca.providers.application;

import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.providers.domain.BlankModerationReasonException;
import com.balaaca.providers.domain.ContestationNotFoundException;
import com.balaaca.providers.domain.NothingToModerateException;
import com.balaaca.providers.domain.ReportNotFoundException;
import com.balaaca.providers.domain.UnknownBookingReferenceException;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase;
import com.balaaca.providers.ports.inbound.ReportProviderUseCase;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Position;
import com.balaaca.providers.ports.outbound.ContestationRepository;
import com.balaaca.providers.ports.outbound.ModerationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Taking a business off the hub, putting it back, and reading why somebody
 * thought it should come off.
 *
 * <p>The audit row is not a side effect here, it is the deliverable. A
 * suspension nobody can account for months later is a decision the platform
 * cannot defend, and the operator will not remember. So the reason travels into
 * the trail in the same transaction as the status change, and a reinstatement
 * writes its own row rather than deleting the first.
 */
@ApplicationScoped
public class ModerateProvidersService implements ModerateProvidersUseCase, ReportProviderUseCase {

    private final ModerationRepository moderation;
    private final ContestationRepository contestations;
    private final AuditTrail audit;

    public ModerateProvidersService(ModerationRepository moderation,
                                    ContestationRepository contestations,
                                    AuditTrail audit) {
        this.moderation = moderation;
        this.contestations = contestations;
        this.audit = audit;
    }

    /**
     * Not audited, and the omission is the same one the report path makes: the
     * trail records what the platform DECIDED, and looking at a list is not a
     * decision. Auditing every page of a listing would bury the suspensions in
     * it, which is the one thing the trail exists to make findable.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ModeratedProviderPage providers(Optional<String> search, Optional<String> status,
                                           Optional<Position> after, int limit) {
        List<ModeratedProvider> fetched = moderation.providers(search, status, after, limit);

        boolean more = fetched.size() > limit;
        List<ModeratedProvider> entries = more ? fetched.subList(0, limit) : fetched;

        return new ModeratedProviderPage(List.copyOf(entries),
                more ? Optional.of(entries.get(entries.size() - 1).position()) : Optional.empty());
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Moderation suspend(String slug, String reason) {
        String written = reason == null ? "" : reason.trim();
        if (written.isEmpty()) {
            throw new BlankModerationReasonException();
        }
        Moderation done = moderation.suspend(slug, written)
                .orElseThrow(() -> new NothingToModerateException(slug));

        // The reason is in the metadata rather than only on the row, because
        // the row is cleared on reinstatement and this is the permanent copy.
        audit.record(new AuditEvent("PROVIDER_SUSPENDED", "provider",
                Optional.of(slug), AuditOutcome.SUCCESS,
                Map.of("reason", written)));

        return done;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Moderation reinstate(String slug) {
        Moderation done = moderation.reinstate(slug)
                .orElseThrow(() -> new NothingToModerateException(slug));

        audit.record(new AuditEvent("PROVIDER_REINSTATED", "provider",
                Optional.of(slug), AuditOutcome.SUCCESS, Map.of()));

        return done;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ReportPage reports(Optional<String> status, Optional<UUID> after, int limit) {
        List<Report> fetched = moderation.reports(status, after, limit);

        boolean more = fetched.size() > limit;
        List<Report> entries = more ? fetched.subList(0, limit) : fetched;

        return new ReportPage(List.copyOf(entries),
                more ? Optional.of(entries.get(entries.size() - 1).id()) : Optional.empty());
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Report review(UUID reportId) {
        Report seen = moderation.review(reportId)
                .orElseThrow(() -> new ReportNotFoundException(reportId));

        audit.record(new AuditEvent("REPORT_REVIEWED", "provider_report",
                Optional.of(reportId.toString()), AuditOutcome.SUCCESS,
                Map.of("provider_slug", seen.providerSlug())));

        return seen;
    }

    /**
     * Not audited, and that is deliberate: the report IS the record. An audit
     * row beside it would carry the same facts under a second name, and the
     * trail is for what the PLATFORM did - a customer filing a complaint is
     * something that happened to the platform, not something it decided.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public void report(String reference, String reason, Optional<String> details) {
        moderation.fileReport(reference, reason, details)
                .orElseThrow(UnknownBookingReferenceException::new);
    }
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ContestationPage contestations(Optional<String> status, Optional<UUID> after,
                                          int limit) {
        List<ContestationView> fetched = contestations.queue(status, after, limit);

        boolean more = fetched.size() > limit;
        List<ContestationView> entries = more ? fetched.subList(0, limit) : fetched;

        return new ContestationPage(List.copyOf(entries),
                more ? Optional.of(entries.get(entries.size() - 1).id()) : Optional.empty());
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ContestationView read(UUID contestationId) {
        ContestationView seen = contestations.markRead(contestationId)
                .orElseThrow(() -> new ContestationNotFoundException(contestationId));

        audit.record(new AuditEvent("CONTESTATION_READ", "provider_contestation",
                Optional.of(contestationId.toString()), AuditOutcome.SUCCESS,
                Map.of("provider_slug", seen.providerSlug())));

        return seen;
    }

}
