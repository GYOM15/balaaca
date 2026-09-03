package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.ModeratedProvider;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.Moderation;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.Report;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Position;
import com.balaaca.providers.ports.outbound.ModerationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import jakarta.persistence.Query;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.UnaryOperator;

/**
 * Moderation, in SQL, and every statement is a function call.
 *
 * <p>Not a style choice - the connection cannot do this work directly, in both
 * directions. {@code balaaca_app} with no tenant bound has one SELECT policy on
 * providers, the public one, so it cannot see a suspended business at all; and
 * it has no policy on {@code provider_reports} whatsoever, because a provider
 * must never read what was filed against it.
 *
 * <p>That produced the defect this shape exists to prevent. The first version
 * called a function that returned an id and then read the provider back on the
 * ordinary connection: the suspension committed, the read-back found nothing,
 * and the operator was told the salon did not exist while it sat suspended.
 * Every function here therefore returns the whole answer, computed as the
 * moderator, which is the only role that can see it.
 */
@ApplicationScoped
public class ModerationSqlRepository implements ModerationRepository {

    /** Raised deliberately by the functions when a statement matched nothing. */
    private static final List<String> NOTHING_MATCHED =
            List.of("Z0003", "Z0004", "Z0005", "Z0007");

    private final EntityManager em;

    public ModerationSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    public List<ModeratedProvider> providers(Optional<String> search, Optional<String> status,
                                             Optional<Position> after, int limit) {
        return rows("""
                SELECT * FROM app_list_all_providers(CAST(:search AS varchar),
                                                     CAST(:status AS varchar),
                                                     CAST(:afterName AS varchar),
                                                     CAST(:afterSlug AS varchar),
                                                     CAST(:limit AS int))
                """,
                q -> q.setParameter("search", search.orElse(null))
                      .setParameter("status", status.orElse(null))
                      .setParameter("afterName", after.map(Position::businessName).orElse(null))
                      .setParameter("afterSlug", after.map(Position::slug).orElse(null))
                      // One more than asked, so the caller can tell a full page
                      // from the last one without a second query.
                      .setParameter("limit", limit + 1))
                .stream().map(r -> toProvider((Object[]) r)).toList();
    }

    @Override
    public Optional<Moderation> suspend(String slug, String reason) {
        return standing("""
                SELECT * FROM app_suspend_provider(CAST(:slug AS varchar),
                                                   CAST(:reason AS varchar))
                """, q -> q.setParameter("slug", slug).setParameter("reason", reason));
    }

    @Override
    public Optional<Moderation> reinstate(String slug) {
        return standing("SELECT * FROM app_reinstate_provider(CAST(:slug AS varchar))",
                        q -> q.setParameter("slug", slug));
    }

    @Override
    public Optional<UUID> fileReport(String reference, String reason, Optional<String> details) {
        return rows("""
                SELECT app_report_provider(CAST(:reference AS varchar),
                                           CAST(:reason AS varchar),
                                           CAST(:details AS varchar))
                """,
                q -> q.setParameter("reference", reference)
                      .setParameter("reason", reason)
                      .setParameter("details", details.orElse(null)))
                .stream().findFirst().map(r -> (UUID) r);
    }

    @Override
    public List<Report> reports(Optional<String> status, Optional<UUID> after, int limit) {
        return rows("""
                SELECT * FROM app_list_provider_reports(CAST(:status AS varchar),
                                                        CAST(:after AS uuid),
                                                        CAST(:limit AS int))
                """,
                q -> q.setParameter("status", status.orElse(null))
                      .setParameter("after", after.orElse(null))
                      // One more than asked, so the caller can tell a full page
                      // from the last one without a second query.
                      .setParameter("limit", limit + 1))
                .stream().map(r -> toReport((Object[]) r)).toList();
    }

    @Override
    public Optional<Report> review(UUID reportId) {
        return rows("SELECT * FROM app_review_provider_report(CAST(:id AS uuid))",
                    q -> q.setParameter("id", reportId))
                .stream().findFirst().map(r -> toReport((Object[]) r));
    }

    private Optional<Moderation> standing(String sql, UnaryOperator<Query> bind) {
        return rows(sql, bind).stream().findFirst().map(r -> {
            Object[] c = (Object[]) r;
            return new Moderation((String) c[0], (String) c[1],
                                  Optional.ofNullable(c[2])
                                          .map(ModerationSqlRepository::instant),
                                  Optional.ofNullable((String) c[3]));
        });
    }

    private static ModeratedProvider toProvider(Object[] r) {
        String slug = (String) r[0];
        String businessName = (String) r[1];
        return new ModeratedProvider(
                slug, businessName,
                Optional.ofNullable((String) r[2]),
                Optional.ofNullable((String) r[3]),
                Optional.ofNullable((String) r[4]),
                Optional.ofNullable((String) r[5]),
                (Boolean) r[6], (String) r[7], instant(r[8]),
                ((Number) r[9]).longValue(),
                Optional.ofNullable((String) r[10]),
                new Position(businessName, slug));
    }

    private static Report toReport(Object[] r) {
        return new Report(
                (UUID) r[0], (String) r[1], (String) r[2], (String) r[3],
                (String) r[4], Optional.ofNullable((String) r[5]),
                (String) r[6], instant(r[7]),
                Optional.ofNullable(r[8]).map(ModerationSqlRepository::instant),
                instant(r[9]), (String) r[10]);
    }

    /**
     * A SQLSTATE the functions raise on purpose is a refusal, not a fault: an
     * unknown slug and an already-suspended one both mean "there is nothing here
     * to do", and the caller turns that into one 404. Anything else propagates -
     * a permission error on a function is a deployment fault, and dressing it up
     * as "not found" would hide the day the moderator role went missing.
     */
    @SuppressWarnings("unchecked")
    private List<Object> rows(String sql, UnaryOperator<Query> bind) {
        try {
            return bind.apply(em.createNativeQuery(sql)).getResultList();
        } catch (PersistenceException e) {
            if (NOTHING_MATCHED.contains(sqlState(e))) {
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
