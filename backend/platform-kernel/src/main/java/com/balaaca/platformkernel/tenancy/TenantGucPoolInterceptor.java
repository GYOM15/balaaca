package com.balaaca.platformkernel.tenancy;

import io.agroal.api.AgroalPoolInterceptor;
import io.quarkus.arc.Arc;
import jakarta.enterprise.context.ApplicationScoped;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import org.jboss.logging.Logger;

/**
 * Publishes the bound tenant to PostgreSQL as {@code app.provider_id}, which is
 * what every Row-Level Security policy reads.
 *
 * <p>This is a connection hook rather than a CDI interceptor for a reason that
 * is easy to get wrong: {@link TenantBoundInterceptor} runs at
 * {@code PLATFORM_BEFORE + 10}, outside the transaction Quarkus opens at
 * {@code +200}, so it cannot issue a transaction-local setting. Binding on
 * connection acquisition puts the statement inside the transaction that
 * enlisted the connection, and covers any path that reaches the database
 * without the annotation.
 *
 * <p>{@code set_config(..., true)} is SET LOCAL: it is discarded at commit or
 * rollback, so a pooled connection never carries one request's tenant into the
 * next.
 */
@ApplicationScoped
public class TenantGucPoolInterceptor implements AgroalPoolInterceptor {

    private static final Logger LOG = Logger.getLogger(TenantGucPoolInterceptor.class);
    private static final String BIND = "SELECT set_config('app.provider_id', ?, true)";

    private final TenantContext tenantContext;

    public TenantGucPoolInterceptor(TenantContext tenantContext) {
        this.tenantContext = tenantContext;
    }

    @Override
    public void onConnectionAcquire(Connection connection) {
        // Flyway at startup, the readiness probe and any scheduled job acquire a
        // connection with no request in flight. Touching a @RequestScoped bean
        // there throws ContextNotActiveException rather than returning empty, so
        // the context has to be tested before it is read.
        String value = "";
        if (Arc.container().requestContext().isActive()) {
            value = tenantContext.current().map(ProviderId::toString).orElse("");
        }
        try (PreparedStatement statement = connection.prepareStatement(BIND)) {
            statement.setString(1, value);
            statement.execute();
        } catch (SQLException e) {
            // Binding nothing means every policy filters every row, so the
            // request fails closed. It must still be loud: a silent failure here
            // looks exactly like a tenant with no data.
            LOG.error("tenant.guc.bind_failed", e);
            throw new TenantBindingFailedException(e);
        }
    }
}
