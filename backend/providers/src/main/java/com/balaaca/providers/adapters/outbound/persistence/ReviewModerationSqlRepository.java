package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.ModerateReviewsUseCase.ModeratedReview;
import com.balaaca.providers.ports.outbound.ReviewModerationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import jakarta.persistence.Query;
import jakarta.transaction.Transactional;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.UnaryOperator;

/**
 * Review moderation, in SQL, and every statement is a function call.
 *
 * <p>The same shape {@code ModerationSqlRepository} takes, for the same reason:
 * {@code balaaca_app} with no tenant bound sees only the PUBLIC read of these
 * tables, so it cannot see a hidden review at all - and the operator's queue is
 * mostly a list of businesses, which the same connection cannot read across
 * tenants either. Each function therefore returns the whole answer, computed as
 * the moderator, which is the only role that can see it.
 *
 * <p>That is the defect the provider queue already paid for once: a function
 * that returned an id, followed by a read-back on the ordinary connection which
 * found nothing, told the operator the row did not exist while it sat there.
 */
@ApplicationScoped
public class ReviewModerationSqlRepository implements ReviewModerationRepository {

    /** Raised deliberately by V050 when a statement matched nothing. */
    private static final String NO_SUCH_REVIEW = "Z0007";

    private final EntityManager em;

    public ReviewModerationSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public List<ModeratedReview> list(Optional<String> status, Optional<UUID> after, int limit) {
        return rows("""
                SELECT * FROM app_list_reviews(CAST(:status AS varchar),
                                               CAST(:after AS uuid),
                                               CAST(:limit AS int))
                """,
                q -> q.setParameter("status", status.orElse(null))
                      .setParameter("after", after.orElse(null))
                      .setParameter("limit", limit))
                .stream().map(ReviewModerationSqlRepository::toReview).toList();
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Optional<ModeratedReview> setVisibility(UUID reviewId, boolean hidden) {
        return rows("""
                SELECT * FROM app_set_review_visibility(CAST(:id AS uuid),
                                                        CAST(:hidden AS boolean))
                """,
                q -> q.setParameter("id", reviewId).setParameter("hidden", hidden))
                .stream().findFirst()
                .map(ReviewModerationSqlRepository::toReview);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public Optional<ModeratedReview> clearReply(UUID reviewId) {
        return rows("SELECT * FROM app_clear_review_reply(CAST(:id AS uuid))",
                    q -> q.setParameter("id", reviewId))
                .stream().findFirst()
                .map(ReviewModerationSqlRepository::toReview);
    }

    private static ModeratedReview toReview(Object[] r) {
        return new ModeratedReview(
                (UUID) r[0], (String) r[1], (String) r[2],
                ((Number) r[3]).intValue(),
                Optional.ofNullable((String) r[4]),
                (String) r[5],
                CustomerReviewSqlRepository.yearMonth(r[6]),
                (String) r[7],
                instant(r[8]),
                Optional.ofNullable(r[9]).map(ReviewModerationSqlRepository::instant),
                ((Number) r[10]).intValue(),
                Optional.ofNullable((String) r[11]));
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> rows(String sql, UnaryOperator<Query> bind) {
        try {
            return bind.apply(em.createNativeQuery(sql)).getResultList();
        } catch (PersistenceException e) {
            if (NO_SUCH_REVIEW.equals(sqlState(e))) {
                return List.of();
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
