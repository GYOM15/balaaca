package com.balaaca.providers.adapters.outbound.persistence;

import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.providers.domain.AlreadyRegisteredException;
import com.balaaca.providers.domain.SlugUnavailableException;
import com.balaaca.providers.ports.inbound.RegisterProviderUseCase.Registration;
import com.balaaca.providers.ports.outbound.ProviderRegistrationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Signing up, in SQL.
 *
 * <p>Every other write in this codebase is an ordinary statement confined by
 * Row-Level Security to the tenant bound on the connection. This one cannot be:
 * there is no tenant yet, and {@code providers_tenant} carries
 * {@code WITH CHECK (id = app_current_provider())}, which with nothing bound is
 * NULL and admits nothing. So the three rows go in through
 * {@code app_register_provider}, a SECURITY DEFINER function owned by
 * balaaca_registrar - the same shape V013 used to break the same circularity for
 * reads, and the whole of it is in V014.
 *
 * <p>The two outcomes a caller can act on arrive as SQLSTATEs the function
 * raises deliberately, because a bare unique violation is one SQLSTATE for three
 * different constraints and telling them apart in Java would mean depending on
 * the PostgreSQL driver's own exception type here. Anything else propagates: a
 * primary-key collision means the application minted a uuid that already exists,
 * and dressing that up as a message about handles would hide a real fault.
 */
@ApplicationScoped
public class ProviderRegistrationSqlRepository implements ProviderRegistrationRepository {

    private static final String SLUG_TAKEN = "Z0001";
    private static final String ALREADY_REGISTERED = "Z0002";

    private final EntityManager em;

    public ProviderRegistrationSqlRepository(EntityManager em) {
        this.em = em;
    }

    @Override
    public ProviderId register(Registration registration, Optional<UUID> categoryId) {
        UUID providerId = UUID.randomUUID();

        // Every parameter is cast explicitly. A null bound to an untyped
        // placeholder leaves PostgreSQL to guess which overload was meant, and
        // it refuses rather than guessing.
        try {
            em.createNativeQuery("""
                    SELECT app_register_provider(
                            CAST(:subject AS varchar), CAST(:userId AS uuid),
                            CAST(:displayName AS varchar), CAST(:email AS varchar),
                            CAST(:providerId AS uuid), CAST(:slug AS varchar),
                            CAST(:businessName AS varchar), CAST(:categoryId AS uuid),
                            CAST(:city AS varchar), CAST(:timezone AS varchar),
                            CAST(:staffId AS uuid))
                    """)
                    .setParameter("subject", registration.account().subject())
                    .setParameter("userId", UUID.randomUUID())
                    .setParameter("displayName", registration.account().displayName())
                    .setParameter("email", registration.account().email().orElse(null))
                    .setParameter("providerId", providerId)
                    .setParameter("slug", registration.slug())
                    .setParameter("businessName", registration.businessName())
                    .setParameter("categoryId", categoryId.orElse(null))
                    .setParameter("city", registration.city().orElse(null))
                    .setParameter("timezone", registration.timezone().getId())
                    .setParameter("staffId", UUID.randomUUID())
                    .getResultList();
        } catch (PersistenceException e) {
            // No further database work here: the transaction is already
            // rollback-only, so a second statement would fail on top of this.
            String state = sqlState(e);
            if (SLUG_TAKEN.equals(state)) {
                throw new SlugUnavailableException(registration.slug());
            }
            if (ALREADY_REGISTERED.equals(state)) {
                throw new AlreadyRegisteredException();
            }
            throw e;
        }

        return ProviderId.of(providerId);
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<UUID> activeCategoryId(String slug) {
        // provider_categories is reference data: no tenant column, no RLS, and
        // readable before a tenant exists, which is what lets a signup name one.
        List<UUID> rows = em.createNativeQuery(
                        "SELECT id FROM provider_categories WHERE slug = :slug AND active")
                .setParameter("slug", slug)
                .getResultList();
        return rows.stream().findFirst();
    }

    /** The cause chain: the driver's exception is wrapped by the time it arrives. */
    private static String sqlState(Throwable e) {
        for (Throwable t = e; t != null && t.getCause() != t; t = t.getCause()) {
            if (t instanceof SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }
}
