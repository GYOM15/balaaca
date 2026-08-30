package com.balaaca.platformkernel.audit;

import com.balaaca.platformkernel.tenancy.AuthenticatedSubject;
import com.balaaca.platformkernel.tenancy.Membership;
import com.balaaca.platformkernel.tenancy.ProviderId;
import com.balaaca.platformkernel.tenancy.TenantContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.Map;
import java.util.Optional;
import org.jboss.logging.Logger;

/**
 * The trail, in SQL.
 *
 * <p>Who and where are read from the bound request rather than accepted from the
 * caller: an actor a caller could name is an actor a caller could get wrong, and
 * a trail whose attribution is an argument is not evidence of anything.
 *
 * <p>{@code actor_ip} stays null, deliberately. Filling it would mean giving the
 * tenancy kernel a dependency on the HTTP layer to store a piece of personal
 * data the reverse proxy already logs, against a column comment that says never
 * more personal data than the action needs to be reconstructible. The account
 * identifies the actor; the address adds a subject and no answer.
 */
@ApplicationScoped
public class AuditTrailSqlRepository implements AuditTrail {

    private static final Logger LOG = Logger.getLogger(AuditTrailSqlRepository.class);

    private final EntityManager em;
    private final TenantContext tenantContext;
    private final AuthenticatedSubject caller;

    public AuditTrailSqlRepository(EntityManager em, TenantContext tenantContext,
                                   AuthenticatedSubject caller) {
        this.em = em;
        this.tenantContext = tenantContext;
        this.caller = caller;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public void record(AuditEvent event) {
        write(event);
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void recordRefusal(AuditEvent event) {
        // Its own transaction, and its own failure handling. A refusal that
        // cannot be written must still be refused: swallowing the insert loses a
        // line of the trail, while letting it escape would turn a clean 403 into
        // a 500 and tell the caller their attempt broke something.
        try {
            write(event);
        } catch (RuntimeException e) {
            LOG.error("audit.refusal_not_recorded action=" + event.action(), e);
        }
    }

    private void write(AuditEvent event) {
        Optional<Membership> membership = tenantContext.membership();

        em.createNativeQuery("""
                INSERT INTO audit_logs (actor_user_id, actor_role, provider_id,
                                        action, entity_type, entity_id,
                                        outcome, metadata)
                VALUES (CAST(:actorUserId AS uuid), CAST(:actorRole AS varchar),
                        CAST(:providerId AS uuid), :action, :entityType,
                        CAST(:entityId AS varchar), :outcome,
                        CAST(:metadata AS jsonb))
                """)
                .setParameter("actorUserId",
                        membership.map(m -> m.userId().value()).orElse(null))
                .setParameter("actorRole",
                        membership.map(m -> m.role().name()).orElse(null))
                .setParameter("providerId",
                        tenantContext.current().map(ProviderId::value).orElse(null))
                .setParameter("action", event.action())
                .setParameter("entityType", event.entityType())
                .setParameter("entityId", event.entityId().orElse(null))
                .setParameter("outcome", event.outcome().name())
                .setParameter("metadata", json(withSubject(event.metadata())))
                .executeUpdate();
    }

    /**
     * The Keycloak subject goes in whenever there is no account to point at -
     * which is exactly the refusal an operator most wants to read, a valid token
     * belonging to nobody here. It is an opaque identifier, not personal data.
     */
    private Map<String, String> withSubject(Map<String, String> metadata) {
        if (tenantContext.membership().isPresent()) {
            return metadata;
        }
        return caller.subject()
                .map(subject -> {
                    var merged = new java.util.LinkedHashMap<>(metadata);
                    merged.put("keycloak_subject", subject);
                    return Map.copyOf(merged);
                })
                .orElse(metadata);
    }

    /**
     * Written by hand rather than through a JSON library, because this module
     * has no serialiser and does not need one for a flat map of strings.
     * Escaping is not optional: an action name is ours, but a metadata value may
     * one day carry a quote, and a broken document would fail the insert and
     * lose the line.
     */
    private static String json(Map<String, String> metadata) {
        StringBuilder out = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : metadata.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            quote(out, entry.getKey()).append(':');
            quote(out, entry.getValue());
        }
        return out.append('}').toString();
    }

    private static StringBuilder quote(StringBuilder out, String raw) {
        out.append('"');
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"');
    }
}
