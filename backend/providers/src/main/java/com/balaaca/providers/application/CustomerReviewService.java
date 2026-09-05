package com.balaaca.providers.application;

import com.balaaca.platformkernel.media.ImageStore;
import com.balaaca.providers.domain.TooManyReviewPhotosException;
import com.balaaca.providers.domain.UnknownBookingReferenceException;
import com.balaaca.providers.ports.inbound.CustomerReviewUseCase;
import com.balaaca.providers.ports.outbound.CustomerReviewRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.Optional;
import java.util.UUID;

/** How it went, in the customer's own words and pictures. */
@ApplicationScoped
public class CustomerReviewService implements CustomerReviewUseCase {

    private final CustomerReviewRepository reviews;
    private final ImageStore images;

    public CustomerReviewService(CustomerReviewRepository reviews, ImageStore images) {
        this.reviews = reviews;
        this.images = images;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public OwnReview submit(String reference, int rating, Optional<String> comment) {
        return reviews.submit(reference, rating, comment);
    }

    /**
     * Validate, store, then point a row at it - in that order, which is the
     * order the logo and the catalogue photographs take.
     *
     * <p>The file is written before the row names it, so a failure leaves an
     * orphan on disk rather than a page pointing at nothing. Wasted bytes are
     * cheap and a broken page is not.
     *
     * <p>FREE, like a photograph of the work: this is what a customer saw when
     * they left, and the platform has no business deciding what to crop out of
     * it. The sanitiser still re-encodes and scales, which is what drops the
     * metadata a telephone writes - and that matters more here than anywhere
     * else in this product, because these pictures are often taken at home and
     * their coordinates are an address.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public OwnReview addPhoto(String reference, byte[] image) {
        String name = images.store(image, ImageStore.Shape.FREE);
        Optional<OwnReview> stored = reviews.addPhoto(reference, name);
        if (stored.isEmpty()) {
            // Every slot taken. The file is dropped rather than left behind:
            // nothing will ever name it, so it is an orphan by construction and
            // not by accident.
            images.discard(name);
            throw new TooManyReviewPhotosException();
        }
        return stored.get();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public OwnReview removePhoto(String reference, UUID photoId) {
        String removed = reviews.removePhoto(reference, photoId);
        // The removal already resolved the reference through its own review, so
        // there is one here. Named rather than asserted away, so the impossible
        // case is still a 404 with a sentence and not a 500 with a stack trace.
        OwnReview left = reviews.of(reference).review()
                .orElseThrow(UnknownBookingReferenceException::new);

        // After the row is gone, so a rollback never deletes a file the page
        // still names.
        images.discard(removed);
        return left;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Verdict of(String reference) {
        return reviews.of(reference);
    }
}
