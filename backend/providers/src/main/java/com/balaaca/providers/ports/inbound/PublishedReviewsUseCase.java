package com.balaaca.providers.ports.inbound;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What customers have said about a business, as a stranger reads it.
 *
 * <p>Public and tenant-free, like the directory it feeds, and safe for the same
 * reason: {@code provider_reviews} carries a public-read policy admitting
 * visible reviews of published, active businesses and nothing else. The breadth
 * comes from the database's own rule rather than from a role that can see
 * everything, so there is no predicate here that somebody could forget to write.
 */
public interface PublishedReviewsUseCase {

    Page page(String slug, Optional<UUID> after, int limit);

    /** Empty when nobody has reviewed. Empty is not zero - see {@link Rating}. */
    Optional<Rating> ratingOf(String slug);

    /**
     * What the stars over a business add up to.
     *
     * <p>Empty when nobody has reviewed, and that is not the same as zero. A
     * business nobody has been to yet has no opinion attached to it; drawing
     * that as nought out of five would mean every new salon on the hub opens
     * with the worst score it can hold, which is an opinion the platform
     * invented.
     *
     * @param average rounded to one decimal in SQL, so the card, the page and
     *                the API print the same figure. Rounding at each surface
     *                would be three places the number is decided - and it stays
     *                a decimal the whole way, because a round trip through a
     *                double is a rounding this project does not need to make
     */
    record Rating(BigDecimal average, int count) {
    }

    /**
     * One published review. No author, no identifier and no day: a first name
     * plus a service plus a small neighbourhood is an identity here, and an
     * exact date laid over the gaps in published availability names one person
     * at a one-chair salon.
     *
     * <p>{@code reply} is the only text on this record the BUSINESS wrote. It
     * carries no date of its own: the review is dated to a month, and an answer
     * dated to a day is a mismatch a reader notices and cannot explain.
     */
    record PublishedReview(int rating,
                           Optional<String> comment,
                           String serviceName,
                           YearMonth visitedMonth,
                           List<String> photoNames,
                           Optional<String> reply) {

        public PublishedReview {
            photoNames = List.copyOf(photoNames);
        }
    }

    /**
     * @param next the id of the last review on this page, which the caller hands
     *             back to resume. A review id is not a capability anywhere on
     *             this API - no route takes one except moderation, which needs a
     *             scope - so unlike the provider id the directory keeps out of
     *             its cursor, publishing it grants nothing
     */
    record Page(List<PublishedReview> reviews, Optional<UUID> next) {
    }
}
