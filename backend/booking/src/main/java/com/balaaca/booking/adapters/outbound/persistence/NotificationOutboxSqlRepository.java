package com.balaaca.booking.adapters.outbound.persistence;

import com.balaaca.booking.domain.PlannedNotification;
import com.balaaca.booking.ports.outbound.NotificationOutboxPort;
import com.balaaca.platformkernel.tenancy.TenantContext;
import com.balaaca.sharedkernel.ids.AppointmentId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Writes outbox rows in the caller's transaction.
 *
 * <p>No transaction of its own, deliberately: {@code REQUIRES_NEW} here would
 * commit the notifications beside the booking rather than with it, which is the
 * dual write the outbox exists to avoid. It joins whatever the caller opened,
 * and if that rolls back so do these rows.
 */
@ApplicationScoped
public class NotificationOutboxSqlRepository implements NotificationOutboxPort {

    private final EntityManager em;
    private final TenantContext tenantContext;

    public NotificationOutboxSqlRepository(EntityManager em, TenantContext tenantContext) {
        this.em = em;
        this.tenantContext = tenantContext;
    }

    @Override
    public void plan(List<PlannedNotification> notifications) {
        if (notifications.isEmpty()) {
            return;
        }
        UUID providerId = tenantContext.require().value();

        for (PlannedNotification n : notifications) {
            // ON CONFLICT on the dedupe key rather than a pre-SELECT: two
            // replays of the same planning would both pass a check-then-insert.
            em.createNativeQuery("""
                    INSERT INTO notifications (
                        id, provider_id, appointment_id, recipient_kind, kind,
                        dedupe_key, to_phone_e164, to_email, locale, payload,
                        scheduled_at)
                    VALUES (
                        :id, :providerId, :appointmentId, :recipientKind, :kind,
                        :dedupeKey, :phone, :email, :locale, CAST(:payload AS jsonb),
                        :scheduledAt)
                    ON CONFLICT (dedupe_key) DO NOTHING
                    """)
                    .setParameter("id", UUID.randomUUID())
                    .setParameter("providerId", providerId)
                    .setParameter("appointmentId", n.appointmentId().value())
                    .setParameter("recipientKind", n.recipient().name())
                    .setParameter("kind", n.kind().name())
                    .setParameter("dedupeKey", n.dedupeKey())
                    .setParameter("phone", n.toPhoneE164().orElse(null))
                    .setParameter("email", n.toEmail().orElse(null))
                    .setParameter("locale", n.locale())
                    .setParameter("payload", json(n.payload()))
                    .setParameter("scheduledAt", java.sql.Timestamp.from(n.scheduledAt()))
                    .executeUpdate();
        }
    }

    @Override
    public void cancelPending(AppointmentId appointmentId) {
        // PENDING only. A SENDING row is held by a worker that is mid-send and
        // may already have reached the customer; a SENT one is gone. Neither is
        // ours to retract, and the dedupe key is what stops a replay of either
        // from becoming a second message.
        em.createNativeQuery("""
                UPDATE notifications
                   SET status = 'CANCELLED', updated_at = now()
                 WHERE appointment_id = :appointmentId
                   AND status = 'PENDING'
                """)
                .setParameter("appointmentId", appointmentId.value())
                .executeUpdate();
    }

    /**
     * The payload is a flat map of template variables, so it is serialised here
     * rather than by pulling a JSON library into an adapter that needs nothing
     * else from one. Quotes and backslashes are escaped; a control character in
     * a template variable would be a bug upstream, not something to encode.
     */
    private static String json(Map<String, String> payload) {
        StringBuilder out = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> e : payload.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            out.append(quote(e.getKey())).append(':').append(quote(e.getValue()));
        }
        return out.append('}').toString();
    }

    private static String quote(String raw) {
        return '"' + raw.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
    }
}
