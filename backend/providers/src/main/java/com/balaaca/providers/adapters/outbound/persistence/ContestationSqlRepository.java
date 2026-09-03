package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.providers.ports.inbound.ContestSuspensionUseCase.Contestation;
import com.balaaca.providers.ports.inbound.ModerateProvidersUseCase.ContestationView;
import com.balaaca.providers.ports.outbound.ContestationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A contestation, written by its author and read by the operator.
 *
 * <p>Two halves with different privileges, and the asymmetry is the design.
 * Filing is an ordinary tenant-scoped INSERT - the business is writing its own
 * row, which is exactly what the tenant policy admits - so it needs no function.
 * Reading the queue does, for the reason every moderation read does: the
 * operator has no provider at all.
 */
@ApplicationScoped
public class ContestationSqlRepository implements ContestationRepository {

    private static final String NOT_FOUND = "Z0010";
    private static final String UNIQUE_VIOLATION = "23505";

    private final EntityManager em;
    private final TenantContext tenant;

    public ContestationSqlRepository(EntityManager em, TenantContext tenant) {
        this.em = em;
        this.tenant = tenant;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<Instant> suspendedSince() {
        // The tenant policy makes this the caller's own row and no other.
        List<Object> rows = em.createNativeQuery(
                        "SELECT suspended_at FROM providers WHERE id = app_current_provider()")
                .getResultList();

        // Not findFirst(): suspended_at is nullable, a business that has never
        // been suspended yields a list holding one null, and Stream.findFirst
        // throws on it. The same trap ProviderProfileSqlRepository documented
        // when the first logo upload broke on it.
        return rows.isEmpty()
                ? Optional.empty()
                : Optional.ofNullable(rows.get(0)).map(ContestationSqlRepository::instant);
    }

    @Override
    public boolean file(String message, Instant aboutSuspensionAt) {
        try {
            em.createNativeQuery("""
                    INSERT INTO provider_contestations
                        (id, provider_id, message, about_suspension_at)
                    VALUES (:id, app_current_provider(), :message, :about)
                    """)
                    .setParameter("id", UUID.randomUUID())
                    .setParameter("message", message)
                    .setParameter("about", java.sql.Timestamp.from(aboutSuspensionAt))
                    .executeUpdate();
            return true;
        } catch (jakarta.persistence.PersistenceException e) {
            // The one-per-episode rule is the unique index, not a pre-check:
            // two taps on a slow connection both read no row and both write.
            if (UNIQUE_VIOLATION.equals(sqlState(e))) {
                return false;
            }
            throw e;
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<Contestation> currentFor(Instant aboutSuspensionAt) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT message, submitted_at, about_suspension_at, status
                  FROM provider_contestations
                 WHERE about_suspension_at = :about
                """)
                .setParameter("about", java.sql.Timestamp.from(aboutSuspensionAt))
                .getResultList();

        return rows.stream().findFirst().map(r -> new Contestation(
                (String) r[0], instant(r[1]), instant(r[2]), "READ".equals(r[3])));
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<ContestationView> queue(Optional<String> status, Optional<UUID> after, int limit) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT * FROM app_list_contestations(CAST(:status AS varchar),
                                                     CAST(:after AS uuid),
                                                     CAST(:limit AS int))
                """)
                .setParameter("status", status.orElse(null))
                .setParameter("after", after.orElse(null))
                .setParameter("limit", limit + 1)
                .getResultList();

        return rows.stream().map(ContestationSqlRepository::toView).toList();
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<ContestationView> markRead(UUID id) {
        try {
            List<Object[]> rows = em.createNativeQuery(
                            "SELECT * FROM app_read_contestation(CAST(:id AS uuid))")
                    .setParameter("id", id)
                    .getResultList();
            return rows.stream().findFirst().map(ContestationSqlRepository::toView);
        } catch (jakarta.persistence.PersistenceException e) {
            if (NOT_FOUND.equals(sqlState(e))) {
                return Optional.empty();
            }
            throw e;
        }
    }

    private static ContestationView toView(Object[] r) {
        return new ContestationView(
                (UUID) r[0], (String) r[1], (String) r[2], (String) r[3],
                (String) r[4], instant(r[5]), (String) r[6], instant(r[7]),
                Optional.ofNullable(r[8]).map(ContestationSqlRepository::instant),
                Optional.ofNullable((String) r[9]));
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
