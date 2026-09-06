package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.PublishedReviewsUseCase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What customers said, in SQL, as a stranger reads it.
 *
 * <p>There is no {@code status = 'VISIBLE'} predicate in any statement here, and
 * its absence is the point. {@code provider_reviews_public_read} admits visible
 * reviews of published, active businesses to a connection with no tenant bound,
 * so a review an operator has taken down is not filtered out here - it does not
 * exist as far as this role is concerned. A predicate would be a second place
 * the rule is stated, and the second place is the one that gets forgotten the
 * day somebody adds a third query.
 *
 * <p>That is also what makes the count under the stars and the list beneath it
 * incapable of disagreeing: both aggregate whatever the one policy admits.
 *
 * <p>Transactional because the empty tenant binding is still a SET LOCAL, and a
 * read outside a transaction runs on a connection this request never prepared.
 */
@ApplicationScoped
public class PublishedReviewsSqlRepository implements PublishedReviewsUseCase {

    private final EntityManager em;

    public PublishedReviewsSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    @SuppressWarnings("unchecked")
    public Page page(String slug, Optional<UUID> after, int limit) {
        // One row more than asked for. Its existence is the only thing that
        // decides whether there is a next page, and it is never returned.
        int window = limit + 1;

        List<Object[]> rows = em.createNativeQuery("""
                SELECT r.id, r.rating, r.comment, r.service_name, r.visited_month,
                       -- The photographs of this review, in the order they were
                       -- added. A correlated aggregate rather than a second
                       -- round trip per row: (review_id, sort_order) is indexed,
                       -- so a page of twenty costs twenty index scans and not
                       -- twenty statements.
                       (SELECT array_agg(ph.stored_name ORDER BY ph.sort_order)
                          FROM review_photos ph WHERE ph.review_id = r.id)
                  FROM provider_reviews r
                  JOIN providers p ON p.id = r.provider_id
                 WHERE p.slug = :slug
                   -- The cursor compares the same pair the order is taken on, so
                   -- a page boundary lands in the same place twice. created_at
                   -- alone would not survive two reviews in one second.
                   AND (CAST(:after AS uuid) IS NULL
                        OR (r.created_at, r.id)
                           < (SELECT created_at, id FROM provider_reviews
                               WHERE id = CAST(:after AS uuid)))
                 ORDER BY r.created_at DESC, r.id DESC
                 LIMIT :window
                """)
                .setParameter("slug", slug)
                .setParameter("after", after.orElse(null))
                .setParameter("window", window)
                .getResultList();

        List<PublishedReview> reviews = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        for (Object[] r : rows.stream().limit(limit).toList()) {
            ids.add((UUID) r[0]);
            reviews.add(new PublishedReview(
                    ((Number) r[1]).intValue(),
                    Optional.ofNullable((String) r[2]),
                    (String) r[3],
                    CustomerReviewSqlRepository.yearMonth(r[4]),
                    names(r[5])));
        }

        Optional<UUID> next = rows.size() > reviews.size() && !ids.isEmpty()
                ? Optional.of(ids.get(ids.size() - 1))
                : Optional.empty();

        return new Page(List.copyOf(reviews), next);
    }

    /**
     * The stars over one business, over exactly the reviews {@link #page} would
     * return.
     *
     * <p>Empty when nobody has reviewed. Not zero: a business nobody has been to
     * has no opinion attached to it, and drawing that as nought out of five
     * would mean every new salon on the hub opens with the worst score it can
     * hold - an opinion the platform invented.
     */
    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Optional<Rating> ratingOf(String slug) {
        Object[] row = (Object[]) em.createNativeQuery("""
                -- Rounded HERE, so the card, the page and the API print the same
                -- figure. A client that rounded for itself would be a second
                -- place the number is decided, and the two would drift by a
                -- tenth on some salon nobody notices for a year.
                SELECT round(avg(r.rating)::numeric, 1), count(*)::int
                  FROM provider_reviews r
                  JOIN providers p ON p.id = r.provider_id
                 WHERE p.slug = :slug
                """).setParameter("slug", slug).getSingleResult();

        int count = ((Number) row[1]).intValue();
        return count == 0
                ? Optional.empty()
                : Optional.of(new Rating((java.math.BigDecimal) row[0], count));
    }

    /** {@code array_agg} over no rows is NULL, which is a review with no pictures. */
    private static List<String> names(Object value) {
        if (value == null) {
            return List.of();
        }
        return List.of((String[]) value);
    }
}
