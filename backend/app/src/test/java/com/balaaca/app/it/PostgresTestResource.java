package com.balaaca.app.it;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.util.Map;
import org.testcontainers.containers.GenericContainer;
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

    /**
     * A Redis of the tests' own, and it is not optional any more.
     *
     * <p>application.properties points quarkus.redis.hosts at the development
     * compose stack, and an explicit host disables Dev Services - so before
     * this the integration tests were talking to the DEVELOPER'S OWN Redis.
     * They got NOAUTH, the rate limiter failed open exactly as it is designed
     * to, and the test that was supposed to prove the limit proved nothing
     * while passing its own assertions about everything else.
     *
     * <p>Worse than the false confidence: a suite that writes to a machine's
     * real Redis is a suite that can wedge somebody's dev environment.
     */
    private GenericContainer<?> redis;

    @Override
    public Map<String, String> start() {
        postgres = new PostgreSQLContainer<>(IMAGE)
                .withDatabaseName("balaaca")
                .withUsername("postgres")
                .withPassword("test")
                .withInitScript("test-bootstrap.sql");
        postgres.start();

        redis = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                .withExposedPorts(6379);
        redis.start();

        return Map.of(
                "quarkus.datasource.jdbc.url", postgres.getJdbcUrl(),
                "quarkus.datasource.username", "balaaca_app",
                "quarkus.datasource.password", "test",
                "quarkus.flyway.username", "balaaca_migrator",
                "quarkus.flyway.password", "test",
                "quarkus.flyway.migrate-at-start", "true",
                "quarkus.redis.hosts",
                "redis://" + redis.getHost() + ":" + redis.getMappedPort(6379),
                // The compose Redis has a password and this one does not, so
                // the configured value has to be cleared rather than inherited.
                "quarkus.redis.password", "");
    }

    @Override
    public void stop() {
        if (postgres != null) {
            postgres.stop();
        }
        if (redis != null) {
            redis.stop();
        }
    }

    /** Superuser handle, for seeding fixtures past RLS. */
    public String adminJdbcUrl() {
        return postgres.getJdbcUrl();
    }
}
