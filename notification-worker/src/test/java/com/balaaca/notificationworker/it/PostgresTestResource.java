package com.balaaca.notificationworker.it;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * A real PostgreSQL, carrying the real schema.
 *
 * <p>The migrations are read from the application deployable's own directory
 * rather than copied here. A copy would drift, and the day it drifted this test
 * would go on passing against a table the worker no longer meets in production.
 * The worker still runs no Flyway of its own: it owns no schema, and must not be
 * able to alter the one table it reads.
 *
 * <p>It connects as balaaca_notification_worker, never as the owner or the
 * superuser. Connecting as either would make its RLS policy and its two grants
 * inert, and the isolation these tests exist to prove would be switched off
 * while they all passed.
 */
public class PostgresTestResource implements QuarkusTestResourceLifecycleManager {

    private static final DockerImageName IMAGE = DockerImageName.parse("postgres:18.6");
    private static final Path MIGRATIONS =
            Path.of("../backend/app/src/main/resources/db/migration");

    private PostgreSQLContainer<?> postgres;

    @Override
    public Map<String, String> start() {
        postgres = new PostgreSQLContainer<>(IMAGE)
                .withDatabaseName("balaaca")
                .withUsername("postgres")
                .withPassword("test")
                .withInitScript("test-bootstrap.sql");
        postgres.start();
        migrate();

        return Map.of(
                "quarkus.datasource.jdbc.url", postgres.getJdbcUrl(),
                "quarkus.datasource.username", "balaaca_notification_worker",
                "quarkus.datasource.password", "test");
    }

    /** Applied as balaaca_migrator, in filename order, exactly as Flyway would. */
    private void migrate() {
        Path dir = MIGRATIONS.toAbsolutePath().normalize();
        if (!Files.isDirectory(dir)) {
            throw new IllegalStateException("migrations not found at " + dir);
        }
        try (Stream<Path> files = Files.list(dir);
             Connection c = DriverManager.getConnection(postgres.getJdbcUrl(),
                                                        "balaaca_migrator", "test")) {
            List<Path> ordered = files.filter(p -> p.getFileName().toString().endsWith(".sql"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
            for (Path file : ordered) {
                try (Statement s = c.createStatement()) {
                    s.execute(Files.readString(file));
                }
            }
        } catch (IOException | SQLException e) {
            throw new IllegalStateException("could not apply migrations from " + dir, e);
        }
    }

    @Override
    public void stop() {
        if (postgres != null) {
            postgres.stop();
        }
    }

    /** Superuser handle, for seeding rows the worker's own role could never insert. */
    public String adminJdbcUrl() {
        return postgres.getJdbcUrl();
    }
}
