package com.balaaca.providers.application;

import com.balaaca.platformkernel.audit.AuditEvent;
import com.balaaca.platformkernel.audit.AuditOutcome;
import com.balaaca.platformkernel.audit.AuditTrail;
import com.balaaca.providers.domain.ReviewNotFoundException;
import com.balaaca.providers.ports.inbound.ModerateReviewsUseCase;
import com.balaaca.providers.ports.outbound.ReviewModerationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Taking a review down, putting it back, and removing a business's answer.
 *
 * <p>It exists for the trail. The SQL class implemented this use case directly,
 * so there was no application layer to hold anything that is not a statement -
 * and what fell through that gap is the record. Suspending a business has
 * written an audit row since the day it was built; hiding a customer's words
 * wrote nothing, which is the more contestable of the two: a provider who finds
 * their review gone has somebody to ask, and the platform had no answer.
 *
 * <p>Same reasoning as {@link ModerateProvidersService}: the row is not a side
 * effect, it is the deliverable, and it commits in the same transaction as the
 * change it describes.
 */
@ApplicationScoped
public class ModerateReviewsService implements ModerateReviewsUseCase {

    private final ReviewModerationRepository reviews;
    private final AuditTrail audit;

    public ModerateReviewsService(ReviewModerationRepository reviews, AuditTrail audit) {
        this.reviews = reviews;
        this.audit = audit;
    }

    /**
     * Not audited, like every other listing here: the trail records what the
     * platform DECIDED, and looking at a queue is not a decision. Auditing each
     * page would bury the takedowns in it, which is the one thing the trail
     * exists to make findable.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ReviewPage list(Optional<String> status, Optional<UUID> after, int limit) {
        // One more than asked for, so a full page can be told from the last one
        // without a second query. The extra row is never returned.
        List<ModeratedReview> fetched = reviews.list(status, after, limit + 1);

        boolean more = fetched.size() > limit;
        List<ModeratedReview> entries = more ? fetched.subList(0, limit) : fetched;

        return new ReviewPage(List.copyOf(entries),
                more ? Optional.of(entries.get(entries.size() - 1).id()) : Optional.empty());
    }

    /**
     * Both directions on the trail, and the same verb with the state in the
     * metadata rather than two verbs. Putting a review back is as much a
     * decision as taking it down, and reading a takedown without its reversal
     * beside it would be reading half the story.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ModeratedReview setVisibility(UUID reviewId, boolean hidden) {
        ModeratedReview done = reviews.setVisibility(reviewId, hidden)
                .orElseThrow(() -> new ReviewNotFoundException(reviewId));

        // The business is named because the trail is read by provider when a
        // suspension or a takedown is contested, and the review id alone would
        // mean opening the row to find out whose it was. The customer's words
        // are NOT here: the metadata carries what makes the action
        // reconstructible, never the content it was about.
        audit.record(new AuditEvent("REVIEW_VISIBILITY_SET", "provider_review",
                Optional.of(reviewId.toString()), AuditOutcome.SUCCESS,
                Map.of("hidden", Boolean.toString(hidden),
                       "provider_slug", done.providerSlug())));

        return done;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public ModeratedReview clearReply(UUID reviewId) {
        ModeratedReview done = reviews.clearReply(reviewId)
                .orElseThrow(() -> new ReviewNotFoundException(reviewId));

        audit.record(new AuditEvent("REVIEW_REPLY_CLEARED", "provider_review",
                Optional.of(reviewId.toString()), AuditOutcome.SUCCESS,
                Map.of("provider_slug", done.providerSlug())));

        return done;
    }
}
