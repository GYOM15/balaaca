package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.domain.ReviewNotYetPossibleException;
import com.balaaca.providers.domain.ReviewTakenDownException;
import com.balaaca.providers.domain.UnknownBookingReferenceException;
import com.balaaca.providers.ports.inbound.CustomerReviewUseCase.OwnReview;
import com.balaaca.providers.ports.inbound.CustomerReviewUseCase.Photo;
import com.balaaca.providers.ports.inbound.CustomerReviewUseCase.Status;
import com.balaaca.providers.ports.inbound.CustomerReviewUseCase.Verdict;
import com.balaaca.providers.ports.outbound.CustomerReviewRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * One customer's review, in SQL.
 *
 * <p>Every WRITE is a function call and none of them is a plain statement. The
 * reason is not privilege - the tenant is bound from the reference on this path,
 * so a policy would admit the write - it is that the function resolves the
 * reference INSIDE. There is no argument a caller could pass that files a review
 * against an appointment their reference does not name, and no application check
 * anybody has to remember not to delete.
 *
 * <p>The READ is a plain statement, and it carries the reference in its WHERE
 * for the same reason every other customer route does. Binding a booking binds
 * the whole provider (4.6), so what confines a customer to their own row is the
 * predicate, exactly as it confines them to their own appointment on the route
 * next door. The join runs from the appointment outwards, so this statement can
 * only ever reach the review of the booking whose reference was presented.
 */
@ApplicationScoped
public class CustomerReviewSqlRepository implements CustomerReviewRepository {

    /** Raised deliberately by V050's functions. Anything else is a fault. */
    private static final String NO_SUCH_BOOKING = "Z0005";
    private static final String NOT_YET = "Z0011";
    private static final String TAKEN_DOWN = "Z0012";

    private final EntityManager em;

    public CustomerReviewSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    public OwnReview submit(String reference, int rating, Optional<String> comment) {
        refused(() -> em.createNativeQuery("""
                SELECT app_submit_review(CAST(:reference AS varchar),
                                         CAST(:rating AS smallint),
                                         CAST(:comment AS varchar))
                """)
                .setParameter("reference", reference)
                .setParameter("rating", rating)
                .setParameter("comment", comment.orElse(null))
                .getSingleResult());

        // Read back through the ordinary connection rather than out of the
        // function. The function's own row would be the state at insert; this is
        // the state a client is about to be shown, photographs included.
        return of(reference).review().orElseThrow(UnknownBookingReferenceException::new);
    }

    @Override
    public Optional<OwnReview> addPhoto(String reference, String storedName) {
        boolean stored = !refused(() -> em.createNativeQuery("""
                SELECT * FROM app_add_review_photo(CAST(:reference AS varchar),
                                                   CAST(:name AS varchar))
                """)
                .setParameter("reference", reference)
                .setParameter("name", storedName)
                .getResultList()).isEmpty();

        // No row means all three slots were taken, which is a refusal the caller
        // turns into 422 - and it has a file to drop, which is why this is an
        // Optional rather than an exception thrown from here.
        return stored ? of(reference).review() : Optional.empty();
    }

    @Override
    public String removePhoto(String reference, UUID photoId) {
        return (String) refused(() -> em.createNativeQuery("""
                SELECT app_remove_review_photo(CAST(:reference AS varchar),
                                               CAST(:photo AS uuid))
                """)
                .setParameter("reference", reference)
                .setParameter("photo", photoId)
                .getSingleResult());
    }

    @Override
    @SuppressWarnings("unchecked")
    public Verdict of(String reference) {
        // app_may_review, and not `status <> 'CANCELLED' AND ends_at <= now()`
        // written out again here. The write path asks the same function, so a
        // page cannot offer a form the write path then refuses.
        List<Object[]> rows = em.createNativeQuery("""
                SELECT app_may_review(a.status, a.ends_at, r.status),
                       r.id, r.rating, r.comment, r.service_name,
                       r.visited_month, r.status
                  FROM appointments a
                  LEFT JOIN provider_reviews r ON r.appointment_id = a.id
                 WHERE a.public_reference = :reference
                """).setParameter("reference", reference).getResultList();

        Object[] row = rows.stream().findFirst()
                .orElseThrow(UnknownBookingReferenceException::new);

        boolean reviewable = Boolean.TRUE.equals(row[0]);
        if (row[1] == null) {
            return new Verdict(reviewable, Optional.empty());
        }

        UUID reviewId = (UUID) row[1];
        return new Verdict(reviewable, Optional.of(new OwnReview(
                ((Number) row[2]).intValue(),
                Optional.ofNullable((String) row[3]),
                (String) row[4],
                yearMonth(row[5]),
                Status.valueOf((String) row[6]),
                photos(reviewId))));
    }

    @SuppressWarnings("unchecked")
    private List<Photo> photos(UUID reviewId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT id, stored_name, sort_order
                  FROM review_photos
                 WHERE review_id = :review
                 ORDER BY sort_order
                """).setParameter("review", reviewId).getResultList();

        return rows.stream()
                .map(r -> new Photo((UUID) r[0], (String) r[1], ((Number) r[2]).intValue()))
                .toList();
    }

    /**
     * A SQLSTATE V050 raises on purpose is a refusal, not a fault.
     *
     * <p>Anything else propagates. A permission error on one of these functions
     * is a deployment fault, and dressing it up as "no such booking" would hide
     * the day the moderator role went missing behind a 404 nobody investigates.
     */
    private static <T> T refused(java.util.function.Supplier<T> work) {
        try {
            return work.get();
        } catch (PersistenceException e) {
            String state = sqlState(e);
            if (NO_SUCH_BOOKING.equals(state)) {
                throw new UnknownBookingReferenceException();
            }
            if (NOT_YET.equals(state)) {
                throw new ReviewNotYetPossibleException();
            }
            if (TAKEN_DOWN.equals(state)) {
                throw new ReviewTakenDownException();
            }
            throw e;
        }
    }

    private static String sqlState(Throwable e) {
        for (Throwable t = e; t != null && t.getCause() != t; t = t.getCause()) {
            if (t instanceof SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    /** A month column, whichever of the two date shapes the driver hands back. */
    static YearMonth yearMonth(Object value) {
        LocalDate date = value instanceof LocalDate local
                ? local
                : ((java.sql.Date) value).toLocalDate();
        return YearMonth.from(date);
    }
}
