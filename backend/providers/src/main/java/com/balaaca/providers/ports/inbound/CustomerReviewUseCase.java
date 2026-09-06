package com.balaaca.providers.ports.inbound;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A customer saying how it went, reached by their booking reference.
 *
 * <p>Never by a slug, and the argument is V037's for reports, only louder: this
 * is a market where a salon's competitor is three streets away and knows the
 * handle. An open review form on a public page is a button that competitor can
 * press from a script all night, and a five-star form is a button the business
 * itself can press.
 *
 * <p>The reference is the capability the customer already holds. Requiring it
 * means a review comes from somebody who was actually served, which is the one
 * property that makes a star worth reading.
 */
public interface CustomerReviewUseCase {

    /**
     * Create it, or replace what this customer said before.
     *
     * @throws com.balaaca.providers.domain.UnknownBookingReferenceException
     *         when the reference names no appointment
     * @throws com.balaaca.providers.domain.ReviewNotYetPossibleException
     *         when the visit has not happened, or did not happen
     * @throws com.balaaca.providers.domain.ReviewTakenDownException
     *         when an operator removed it, which is terminal
     */
    OwnReview submit(String reference, int rating, Optional<String> comment);

    /**
     * @throws com.balaaca.providers.domain.TooManyReviewPhotosException
     *         when all three slots are taken
     */
    OwnReview addPhoto(String reference, byte[] image);

    OwnReview removePhoto(String reference, UUID photoId);

    /**
     * What this customer has already said, and whether they may say it now.
     *
     * <p>Both together and in one read, because the page that shows a finished
     * appointment needs both to decide between the form and the review, and
     * asking twice would be two round trips on every booking to answer nothing
     * for most of them.
     */
    Verdict of(String reference);

    /**
     * @param reviewable computed by the SAME database function the write path
     *                   consults, never re-derived here from a status and an
     *                   end time. Two copies of that rule is a page that offers
     *                   a button which answers 409
     */
    record Verdict(boolean reviewable, Optional<OwnReview> review) {
    }

    /** The review as its author sees it: with identifiers, and with the truth. */
    record OwnReview(int rating,
                     Optional<String> comment,
                     String serviceName,
                     YearMonth visitedMonth,
                     Status status,
                     List<Photo> photos) {

        public OwnReview {
            photos = List.copyOf(photos);
        }
    }

    /**
     * {@code HIDDEN} is shown to the author rather than hidden from them. A
     * review that has silently vanished from a page teaches its writer that the
     * site is broken; saying it was taken down is the only honest option, and it
     * is terminal, so the page can stop offering the form.
     */
    enum Status { VISIBLE, HIDDEN }

    record Photo(UUID id, String storedName, int position) {
    }
}
