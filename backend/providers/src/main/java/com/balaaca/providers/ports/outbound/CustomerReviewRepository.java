package com.balaaca.providers.ports.outbound;

import com.balaaca.providers.ports.inbound.CustomerReviewUseCase.OwnReview;
import com.balaaca.providers.ports.inbound.CustomerReviewUseCase.Verdict;
import java.util.Optional;
import java.util.UUID;

/**
 * One customer's review, addressed by the reference that proves they were there.
 *
 * <p>Every write is a database function call, for the reason report filing is:
 * the reference is resolved INSIDE, so no argument a caller could pass can file
 * a review against an appointment their reference does not name. The other
 * shape - bind the tenant from the reference, then insert under a policy - would
 * leave one application check standing between a customer and every other
 * appointment of the same business.
 */
public interface CustomerReviewRepository {

    /**
     * @return the review as it now stands
     * @throws com.balaaca.providers.domain.UnknownBookingReferenceException,
     *         {@code ReviewNotYetPossibleException}, {@code ReviewTakenDownException}
     */
    OwnReview submit(String reference, int rating, Optional<String> comment);

    /** @return empty when all three slots are taken, so the caller can drop the file */
    Optional<OwnReview> addPhoto(String reference, String storedName);

    /** @return the name the row held, so the caller can drop the file */
    String removePhoto(String reference, UUID photoId);

    Verdict of(String reference);
}
