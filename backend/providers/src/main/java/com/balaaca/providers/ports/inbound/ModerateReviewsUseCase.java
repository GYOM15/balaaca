package com.balaaca.providers.ports.inbound;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The takedown lever, and deliberately nothing more.
 *
 * <p>There is no queue of reported reviews here, which is the same decision this
 * platform took about businesses: no vetting at the door, a sanction that exists
 * before launch, and the back-office that routes complaints to it once there are
 * complaints. What must exist on day one is the button, because the alternative
 * to a button is a database session at midnight.
 *
 * <p>Reversible, and one operation with a flag rather than two, because an
 * operator who took down the wrong review has to be able to put it back.
 */
public interface ModerateReviewsUseCase {

    ReviewPage list(Optional<String> status, Optional<UUID> after, int limit);

    /**
     * @throws com.balaaca.providers.domain.ReviewNotFoundException
     *         when no review carries that id
     */
    ModeratedReview setVisibility(UUID reviewId, boolean hidden);

    /**
     * Remove a business's answer and leave the review standing.
     *
     * <p>A separate lever from the takedown, and it has to be. Hiding was the
     * only one there was, and it is the wrong tool for a business that answers
     * a fair complaint with an insult: it would deal with that by removing the
     * CUSTOMER's words too, punishing the person who was wronged in order to
     * reach the person who wronged them.
     *
     * @throws com.balaaca.providers.domain.ReviewNotFoundException when no
     *         review carries that id
     */
    ModeratedReview clearReply(UUID reviewId);

    /**
     * @param photoCount how many pictures hang off it, and not the pictures. The
     *                   queue is a list; an operator deciding whether to remove
     *                   something opens the page and looks at it
     */
    record ReviewPage(List<ModeratedReview> entries, Optional<UUID> next) {
    }

    record ModeratedReview(UUID id,
                           String providerSlug,
                           String providerName,
                           int rating,
                           Optional<String> comment,
                           String serviceName,
                           YearMonth visitedMonth,
                           String status,
                           Instant createdAt,
                           Optional<Instant> hiddenAt,
                           int photoCount,
                           Optional<String> reply) {
    }
}
