package com.balaaca.providers.ports.inbound;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A business reading what was said about it, and answering.
 *
 * <p>Reading includes the reviews an operator has taken down. A business that
 * cannot see what was said cannot answer the customer or ask for a takedown,
 * and one that watched its average move without being told why would be right
 * to think the platform was hiding something.
 *
 * <p>Answering is the ONLY write this surface has, and the only one the database
 * role can make on that table. What confines it is not this interface: it is a
 * column privilege, {@code UPDATE (reply, replied_at)} and nothing else, so a
 * handler that tried to carry a rating would be refused by PostgreSQL before
 * any policy was consulted. There is no operation here that writes, raises or
 * deletes a review, and none could be added without a migration granting the
 * privilege - which is the point.
 */
public interface OwnReviewsUseCase {

    Page page(Optional<UUID> after, int limit);

    /**
     * Answer, or replace the answer already there. The same person, the same
     * review, a corrected sentence.
     *
     * @throws com.balaaca.providers.domain.ReviewNotFoundException when no
     *         review of this business carries that id
     * @throws com.balaaca.providers.domain.ReviewTakenDownException when it was
     *         taken down, so there is nothing published to answer
     */
    OwnReview reply(UUID reviewId, String reply);

    OwnReview withdrawReply(UUID reviewId);

    /** The business's own view: with the identifier a reply is addressed by. */
    record OwnReview(UUID id,
                     int rating,
                     Optional<String> comment,
                     String serviceName,
                     YearMonth visitedMonth,
                     String status,
                     Instant createdAt,
                     List<String> photoNames,
                     Optional<String> reply) {

        public OwnReview {
            photoNames = List.copyOf(photoNames);
        }
    }

    record Page(List<OwnReview> entries, Optional<UUID> next) {
    }
}
