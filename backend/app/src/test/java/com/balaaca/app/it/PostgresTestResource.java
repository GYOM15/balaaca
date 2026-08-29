package com.balaaca.app.it;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.util.Map;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * A real PostgreSQL for the tests that need one.
 *
 * <p>Not Dev Services, and not H2: these tests exist to prove Row-Level
 * Security, an exclusion constraint and a deadlock retry. None of the three
 * exists outside PostgreSQL, and Dev Services would connect as a single
 * superuser, for which RLS is silently inert - every test would pass while the
 * isolation it claims to prove was switched off.
 *
 * <p>The container creates the same least-privilege roles the real bootstrap
 * does, and the application connects as balaaca_app while Flyway migrates as
 * balaaca_migrator, exactly as in production.
 */
public class PostgresTestResource implements QuarkusTestResourceLifecycleManager {

    private static final DockerImageName IMAGE = DockerImageName.parse("postgres:18.6");

    private PostgreSQLContainer<?> postgres;

    @Override
    public Map<String, String> start() {
        postgres = new PostgreSQLContainer<>(IMAGE)
                .withDatabaseName("balaaca")
                .withUsername("postgres")
                .withPassword("test")
                .withInitScript("test-bootstrap.sql");
        postgres.start();

        return Map.of(
                "quarkus.datasource.jdbc.url", postgres.getJdbcUrl(),
                "quarkus.datasource.username", "balaaca_app",
                "quarkus.datasource.password", "test",
                "quarkus.flyway.username", "balaaca_migrator",
                "quarkus.flyway.password", "test",
                "quarkus.flyway.migrate-at-start", "true",
                // Redis is not exercised here; an unreachable one must not make
                // the datasource tests fail for an unrelated reason.
                "quarkus.redis.devservices.enabled", "true");
    }

    @Override
    public void stop() {
        if (postgres != null) {
            postgres.stop();
        }
    }

    /** Superuser handle, for seeding fixtures past RLS. */
    public String adminJdbcUrl() {
        return postgres.getJdbcUrl();
    }
}
