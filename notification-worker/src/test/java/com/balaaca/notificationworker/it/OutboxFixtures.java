package com.balaaca.notificationworker.it;

import jakarta.enterprise.context.ApplicationScoped;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Seeds outbox rows as the superuser.
 *
 * <p>Necessarily, not conveniently: the worker's role is granted SELECT and
 * UPDATE on this table and nothing else, so it cannot insert its own fixtures,
 * and it cannot touch providers at all. The worker under test never sees this
 * connection - it runs as balaaca_notification_worker with its policy in force.
 */
@ApplicationScoped
public class OutboxFixtures {

    public static final UUID SALON = UUID.fromString("11111111-1111-1111-1111-111111111111");
    public static final UUID OTHER = UUID.fromString("22222222-2222-2222-2222-222222222222");

    private final String jdbcUrl;

    public OutboxFixtures(@ConfigProperty(name = "quarkus.datasource.jdbc.url") String jdbcUrl) {
        this.jdbcUrl = jdbcUrl;
    }

    public void reset() {
        run("TRUNCATE notifications, providers CASCADE");
        run("""
            INSERT INTO providers (id, slug, business_name, country_code, published, status) VALUES
              ('%s','salon-fatou','Salon Fatou','GN',true,'ACTIVE'),
              ('%s','autre-salon','Autre Salon','GN',true,'ACTIVE')
            """.formatted(SALON, OTHER));
    }

    /** A row due now. {@code appointment_id} stays null so no appointment is needed. */
    public UUID due(UUID providerId, String dedupeKey) {
        return insert(providerId, dedupeKey, "now()", "now()", 0, 6);
    }

    public UUID scheduledIn(UUID providerId, String dedupeKey, String interval) {
        return insert(providerId, dedupeKey, "now() + interval '" + interval + "'", "now()", 0, 6);
    }

    public UUID retryingUntil(UUID providerId, String dedupeKey, String interval) {
        return insert(providerId, dedupeKey, "now()", "now() + interval '" + interval + "'", 0, 6);
    }

    /** One attempt short of its cap, so the next failure must turn it DEAD. */
    public UUID lastAttempt(UUID providerId, String dedupeKey) {
        return insert(providerId, dedupeKey, "now()", "now()", 5, 6);
    }

    /** Claimed and abandoned: the lease is the age of updated_at. */
    public UUID stale(UUID providerId, String dedupeKey, String heldFor) {
        UUID id = due(providerId, dedupeKey);
        run("UPDATE notifications SET status='SENDING', updated_at = now() - interval '%s' WHERE id='%s'"
                .formatted(heldFor, id));
        return id;
    }

    private UUID insert(UUID providerId, String dedupeKey, String scheduledAt,
                        String retryAfterAt, int attempts, int maxAttempts) {
        UUID id = UUID.randomUUID();
        run("""
            INSERT INTO notifications (
                id, provider_id, recipient_kind, kind, dedupe_key, to_phone_e164,
                locale, payload, scheduled_at, retry_after_at, attempts, max_attempts)
            VALUES ('%s','%s','CUSTOMER','BOOKING_CONFIRMATION','%s','+224622000001',
                    'fr','{"business_name":"Salon Fatou"}'::jsonb, %s, %s, %d, %d)
            """.formatted(id, providerId, dedupeKey, scheduledAt, retryAfterAt,
                          attempts, maxAttempts));
        return id;
    }

    /** How long the row has been held, as the database itself measures it. */
    public double leaseAgeSeconds(UUID id) {
        return Double.parseDouble(text(
                "SELECT extract(epoch FROM now() - updated_at)::text "
                + "FROM notifications WHERE id = '%s'".formatted(id)));
    }

    public String status(UUID id) {
        return text("SELECT status FROM notifications WHERE id = '%s'".formatted(id));
    }

    public String lastError(UUID id) {
        return text("SELECT coalesce(last_error,'') FROM notifications WHERE id = '%s'".formatted(id));
    }

    public String channelUsed(UUID id) {
        return text("SELECT coalesce(channel_used,'') FROM notifications WHERE id = '%s'".formatted(id));
    }

    public int attempts(UUID id) {
        return Integer.parseInt(
                text("SELECT attempts::text FROM notifications WHERE id = '%s'".formatted(id)));
    }

    public boolean sentAtRecorded(UUID id) {
        return "true".equals(text(
                "SELECT (sent_at IS NOT NULL)::text FROM notifications WHERE id = '%s'".formatted(id)));
    }

    public boolean retryPushedIntoTheFuture(UUID id) {
        return "true".equals(text(
                "SELECT (retry_after_at > now())::text FROM notifications WHERE id = '%s'".formatted(id)));
    }

    /** A connection the caller keeps open, to hold a lock while the worker claims. */
    public Connection admin() throws SQLException {
        return DriverManager.getConnection(jdbcUrl, "postgres", "test");
    }

    private String text(String sql) {
        try (Connection c = admin(); Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private void run(String sql) {
        try (Connection c = admin(); Statement s = c.createStatement()) {
            s.execute(sql);
        } catch (SQLException e) {
            throw new IllegalStateException("fixture failed: " + e.getMessage(), e);
        }
    }
}
