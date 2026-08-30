package com.balaaca.notificationworker.adapters.outbound.persistence;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.NotificationOutbox;
import io.agroal.api.AgroalDataSource;
import jakarta.enterprise.context.ApplicationScoped;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The worker's only contact with PostgreSQL.
 *
 * <p>Plain JDBC, not JPA: this deployable reads one table through four
 * statements and gains nothing from a persistence unit it would then have to
 * configure not to manage a schema it does not own.
 *
 * <p>Nothing here sets {@code app.provider_id}. The worker's own RLS policy
 * admits every provider's rows, which is a decision written in SQL rather than
 * a privilege escape: the role holds no BYPASSRLS and is granted SELECT and
 * UPDATE on this table alone. Binding a tenant here would be meaningless
 * anyway - a scheduled drain has no request to scope one to.
 */
@ApplicationScoped
public class NotificationOutboxSqlRepository implements NotificationOutbox {

    private final AgroalDataSource dataSource;

    public NotificationOutboxSqlRepository(AgroalDataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public List<ClaimedNotification> claimDue(int batchSize) {
        // The claim is its own committed transaction: a send must never happen
        // inside the transaction that took the row, or a slow gateway holds the
        // lock and the next replica blocks behind it.
        String sql = """
                UPDATE notifications
                   SET status = 'SENDING', updated_at = now()
                 WHERE id IN (
                       SELECT id FROM notifications
                        WHERE status = 'PENDING'
                          AND scheduled_at <= now()
                          AND retry_after_at <= now()
                        ORDER BY scheduled_at
                        LIMIT ?
                        FOR UPDATE SKIP LOCKED)
                RETURNING id, provider_id, kind, to_phone_e164, to_email, locale,
                          payload::text, dedupe_key, attempts
                """;
        List<ClaimedNotification> claimed = new ArrayList<>();
        try (Connection c = dataSource.getConnection();
             PreparedStatement s = c.prepareStatement(sql)) {
            s.setInt(1, batchSize);
            try (ResultSet rs = s.executeQuery()) {
                while (rs.next()) {
                    claimed.add(new ClaimedNotification(
                            rs.getObject(1, UUID.class),
                            rs.getObject(2, UUID.class),
                            rs.getString(3),
                            Optional.ofNullable(rs.getString(4)),
                            Optional.ofNullable(rs.getString(5)),
                            rs.getString(6),
                            rs.getString(7),
                            rs.getString(8),
                            rs.getInt(9)));
                }
            }
        } catch (SQLException e) {
            throw new OutboxUnavailableException("claim", e);
        }
        return claimed;
    }

    @Override
    public void markSent(UUID id, Channel channel, Instant sentAt) {
        update("""
                UPDATE notifications
                   SET status = 'SENT', sent_at = ?, channel_used = ?, updated_at = now()
                 WHERE id = ?
                """, s -> {
            s.setTimestamp(1, Timestamp.from(sentAt));
            s.setString(2, channel.name());
            s.setObject(3, id);
        }, "markSent");
    }

    @Override
    public boolean scheduleRetry(UUID id, Instant nextAttemptAt, String failureCode) {
        // The cap is read from the row, not from a constant here: max_attempts
        // is a column so that one stubborn recipient can be given a different
        // budget without a deployment.
        // RETURNING rather than a second read: whether this attempt was the
        // last one is decided by the same statement that made it so, and asking
        // afterwards would be asking a row another worker may have moved.
        try (Connection c = dataSource.getConnection();
             PreparedStatement s = c.prepareStatement("""
                UPDATE notifications
                   SET attempts       = attempts + 1,
                       status         = CASE WHEN attempts + 1 >= max_attempts
                                             THEN 'DEAD' ELSE 'PENDING' END,
                       retry_after_at = ?,
                       last_error     = ?,
                       updated_at     = now()
                 WHERE id = ?
                RETURNING status
                """)) {
            s.setTimestamp(1, Timestamp.from(nextAttemptAt));
            s.setString(2, failureCode);
            s.setObject(3, id);
            try (var rs = s.executeQuery()) {
                return rs.next() && "DEAD".equals(rs.getString(1));
            }
        } catch (SQLException e) {
            throw new OutboxUnavailableException("scheduleRetry", e);
        }
    }

    @Override
    public int releaseStaleLeases(Duration olderThan) {
        // updated_at is the lease: the claim is the only statement that sets it
        // on a SENDING row, so its age is exactly how long the row has been held.
        // The parameter carries its type. make_interval's secs argument is
        // double precision, and a parameter whose type PostgreSQL has to infer
        // in that position is the same trap the availability filters hit with
        // 42P18 - except here it does not raise, it just may not match, and a
        // release that quietly matches nothing strands every crashed lease for
        // ever with no error anywhere.
        String sql = """
                UPDATE notifications
                   SET status = 'PENDING', updated_at = now()
                 WHERE status = 'SENDING'
                   AND updated_at < now() - make_interval(secs => CAST(? AS double precision))
                """;
        try (Connection c = dataSource.getConnection();
             PreparedStatement s = c.prepareStatement(sql)) {
            s.setDouble(1, olderThan.toSeconds());
            return s.executeUpdate();
        } catch (SQLException e) {
            throw new OutboxUnavailableException("releaseStaleLeases", e);
        }
    }

    private interface Binder {
        void bind(PreparedStatement s) throws SQLException;
    }

    private void update(String sql, Binder binder, String operation) {
        try (Connection c = dataSource.getConnection();
             PreparedStatement s = c.prepareStatement(sql)) {
            binder.bind(s);
            s.executeUpdate();
        } catch (SQLException e) {
            throw new OutboxUnavailableException(operation, e);
        }
    }

    /**
     * The database, not the message, is what failed. Named apart so the drain
     * loop does not mistake it for a channel failure and burn an attempt on a
     * row that was never sent.
     */
    public static class OutboxUnavailableException extends RuntimeException {
        public OutboxUnavailableException(String operation, Throwable cause) {
            super("notification.outbox." + operation, cause);
        }
    }
}
