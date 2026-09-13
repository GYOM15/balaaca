package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.ModerateReviewsUseCase.ModeratedReview;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The moderator's statements about reviews, and nothing else.
 *
 * <p>It exists because the SQL class used to implement the INBOUND use case
 * directly, which put a REST-facing operation in an outbound adapter and left
 * no application layer to hold anything that is not a statement. What fell
 * through that gap is the audit trail: hiding a customer's review and clearing
 * a business's answer left no record at all, while the suspension beside them
 * has written one since the day it was built.
 *
 * <p>Paging is the service's business and not this one's: the extra row is
 * fetched here because only a statement can fetch it, and what it MEANS is
 * decided above, exactly as {@link ModerationRepository} does it.
 */
public interface ReviewModerationRepository {

    /** @param limit already widened by one, so the caller can see a next page exists */
    List<ModeratedReview> list(Optional<String> status, Optional<UUID> after, int limit);

    /** @return empty when no review carries that id */
    Optional<ModeratedReview> setVisibility(UUID reviewId, boolean hidden);

    /** @return empty when no review carries that id */
    Optional<ModeratedReview> clearReply(UUID reviewId);
}
