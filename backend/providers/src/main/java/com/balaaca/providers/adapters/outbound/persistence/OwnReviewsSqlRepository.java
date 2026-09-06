package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.providers.domain.ReviewNotFoundException;
import com.balaaca.providers.domain.ReviewTakenDownException;
import com.balaaca.providers.ports.inbound.OwnReviewsUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What a business reads about itself, and the one line it may write.
 *
 * <p>No provider predicate on the reads: {@code provider_reviews_tenant_read}
 * supplies it, and a second copy of the rule here is the copy that drifts. The
 * WRITE carries one anyway, because it is an UPDATE and the row it names has to
 * be the caller's for a reason the reader can see without opening the schema.
 *
 * <p>The write cannot reach a rating and this class is not what stops it. The
 * role holds {@code UPDATE (reply, replied_at)} and no other column, so a
 * statement here that set a rating would be refused by PostgreSQL - which is
 * the only kind of guarantee worth having about the trustworthiness of a
 * review.
 */
@ApplicationScoped
public class OwnReviewsSqlRepository implements OwnReviewsUseCase {

    /**
     * Leading newline on purpose: a Java text block strips the trailing space
     * from every line, so {@code "SELECT " + COLUMNS} welds the keyword onto
     * the first column name and PostgreSQL reads {@code SELECTr}.
     */
    private static final String COLUMNS = """

            r.id, r.rating, r.comment, r.service_name, r.visited_month,
            r.status, r.created_at, r.reply
            """;

    private final EntityManager em;
    private final TenantContext tenant;

    public OwnReviewsSqlRepository(EntityManager em, TenantContext tenant) {
        this.em = em;
        this.tenant = tenant;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public Page page(Optional<UUID> after, int limit) {
        // One row more than asked for. Its existence is the only thing that
        // decides whether there is a next page, and it is never returned.
        List<Object[]> rows = em.createNativeQuery("""
                SELECT""" + COLUMNS + """
                  FROM provider_reviews r
                 WHERE (CAST(:after AS uuid) IS NULL
                        OR (r.created_at, r.id)
                           < (SELECT created_at, id FROM provider_reviews
                               WHERE id = CAST(:after AS uuid)))
                 ORDER BY r.created_at DESC, r.id DESC
                 LIMIT :window
                """)
                .setParameter("after", after.orElse(null))
                .setParameter("window", limit + 1)
                .getResultList();

        List<OwnReview> entries = new ArrayList<>();
        for (Object[] r : rows.stream().limit(limit).toList()) {
            entries.add(toReview(r));
        }

        Optional<UUID> next = rows.size() > entries.size() && !entries.isEmpty()
                ? Optional.of(entries.get(entries.size() - 1).id())
                : Optional.empty();

        return new Page(List.copyOf(entries), next);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public OwnReview reply(UUID reviewId, String reply) {
        write(reviewId, reply);
        return require(reviewId);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public OwnReview withdrawReply(UUID reviewId) {
        write(reviewId, null);
        return require(reviewId);
    }

    /**
     * The two columns, together, always.
     *
     * <p>A CHECK constraint pins them as a pair, so a reply without its date and
     * a date without its reply are both refused - which means this statement
     * cannot leave a timestamp behind pointing at nothing.
     *
     * <p>Zero rows changed is not one answer but two, and telling them apart
     * needs a second read: a review of another business does not exist as far
     * as this connection is concerned, while one of this business that an
     * operator took down does - and the second deserves to be said out loud.
     */
    private void write(UUID reviewId, String reply) {
        int changed = em.createNativeQuery("""
                UPDATE provider_reviews
                   SET reply       = CAST(:reply AS varchar),
                       replied_at  = CASE WHEN CAST(:reply AS varchar) IS NULL
                                          THEN NULL ELSE now() END
                 WHERE id = :id AND provider_id = :provider
                """)
                .setParameter("reply", reply)
                .setParameter("id", reviewId)
                .setParameter("provider", tenant.require().value())
                .executeUpdate();

        if (changed == 0) {
            throw exists(reviewId)
                    ? new ReviewTakenDownException()
                    : new ReviewNotFoundException(reviewId);
        }
    }

    /** Visible to this tenant at all, which the UPDATE policy narrows further. */
    private boolean exists(UUID reviewId) {
        return !em.createNativeQuery("SELECT 1 FROM provider_reviews WHERE id = :id")
                .setParameter("id", reviewId)
                .getResultList().isEmpty();
    }

    @SuppressWarnings("unchecked")
    private OwnReview require(UUID reviewId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT""" + COLUMNS + """
                  FROM provider_reviews r WHERE r.id = :id
                """).setParameter("id", reviewId).getResultList();

        return rows.stream().findFirst().map(this::toReview)
                .orElseThrow(() -> new ReviewNotFoundException(reviewId));
    }

    @SuppressWarnings("unchecked")
    private OwnReview toReview(Object[] r) {
        UUID id = (UUID) r[0];
        List<String> photos = em.createNativeQuery("""
                SELECT stored_name FROM review_photos
                 WHERE review_id = :review ORDER BY sort_order
                """).setParameter("review", id).getResultList();

        return new OwnReview(
                id,
                ((Number) r[1]).intValue(),
                Optional.ofNullable((String) r[2]),
                (String) r[3],
                CustomerReviewSqlRepository.yearMonth(r[4]),
                (String) r[5],
                instant(r[6]),
                photos,
                Optional.ofNullable((String) r[7]));
    }

    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime o) {
            return o.toInstant();
        }
        if (value instanceof Instant i) {
            return i;
        }
        return ((java.sql.Timestamp) value).toInstant();
    }
}
