package com.balaaca.providers.ports.inbound;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The platform's own hand.
 *
 * <p>The one capability in this codebase that acts on somebody else's provider
 * by design. Everything else resolves a tenant from the caller's own membership
 * and is confined to it; moderation cannot be, because the whole point is to
 * reach a business the operator does not own.
 *
 * <p>So it does not go through the ordinary write path at all. Two SECURITY
 * DEFINER functions owned by a role that can do exactly this and nothing else
 * are the only way in, and every call writes an audit row - which is the real
 * deliverable. The day a provider contests a suspension, "who, when, why" has
 * to exist, and a reason written at the moment of the decision is worth more
 * than one reconstructed afterwards.
 */
public interface ModerateProvidersUseCase {

    /**
     * Takes a business off the hub. Its page, its slug, its booking route and
     * its listing all stop answering together.
     *
     * <p>Appointments already booked are untouched, deliberately. Suspension
     * stops new harm; cancelling somebody's Thursday appointment because the
     * platform is investigating their salon would harm the customer.
     *
     * @throws com.balaaca.providers.domain.NothingToModerateException when no
     *         such slug exists, or it is already suspended - one answer for
     *         both, like every other lookup here
     */
    Moderation suspend(String slug, String reason);

    /** @throws com.balaaca.providers.domain.NothingToModerateException idem */
    Moderation reinstate(String slug);

    /** Pending first, oldest first: the longest-ignored complaint leads. */
    ReportPage reports(Optional<String> status, Optional<UUID> after, int limit);

    /**
     * Records that the operator looked. It says nothing about whether the
     * business was suspended - that is a separate decision with its own audit
     * row, and a report can be real and still not warrant taking a salon off
     * the hub.
     *
     * @throws com.balaaca.providers.domain.ReportNotFoundException unknown id
     */
    Report review(UUID reportId);

    /** Pending first, oldest first: the longest wait for an answer leads. */
    ContestationPage contestations(Optional<String> status, Optional<UUID> after, int limit);

    /**
     * Records that the operator read it. It says nothing about whether the
     * business was reinstated - that is a separate decision with its own audit
     * row, and a contestation can be read and refused.
     *
     * @throws com.balaaca.providers.domain.ContestationNotFoundException
     */
    ContestationView read(UUID contestationId);

    /**
     * @param currentReason what the provider carries NOW, empty once they have
     *                      been reinstated. Beside the message it tells the
     *                      operator at a glance whether this is still about a
     *                      live decision or one already undone
     */
    record ContestationView(UUID id, String providerSlug, String providerName,
                            String providerStatus, String message,
                            Instant aboutSuspensionAt, String status,
                            Instant submittedAt, Optional<Instant> readAt,
                            Optional<String> currentReason) {
    }

    record ContestationPage(List<ContestationView> entries, Optional<UUID> next) {
    }

    record Moderation(String slug, String status,
                      Optional<Instant> suspendedAt, Optional<String> reason) {
    }

    /**
     * @param appointmentStartsAt what the report is about, so it reads as an
     *                            event rather than an accusation
     */
    record Report(UUID id, String providerSlug, String providerName,
                  String providerStatus, String reason, Optional<String> details,
                  String status, Instant reportedAt, Optional<Instant> reviewedAt,
                  Instant appointmentStartsAt, String serviceName) {
    }

    record ReportPage(List<Report> entries, Optional<UUID> next) {
    }
}
