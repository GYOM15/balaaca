package com.balaaca.platformkernel.audit;

import java.util.Map;
import java.util.Optional;

/**
 * One line of the trail.
 *
 * <p>Who and where are not here, and that is not an omission: the actor and the
 * tenant come from the bound request, so a caller cannot describe an action as
 * someone else's. What a caller supplies is what it did.
 *
 * @param action     a stable verb in SCREAMING_SNAKE_CASE, read by an operator
 *                   and one day by a query
 * @param entityType what the action was about, in the table's own vocabulary
 * @param entityId   the row, when there is one. A refused action often has none
 * @param metadata   structured context. Never a secret, and never more personal
 *                   data than the action needs to be reconstructible - so no
 *                   customer name, no phone, no email
 */
public record AuditEvent(String action,
                         String entityType,
                         Optional<String> entityId,
                         AuditOutcome outcome,
                         Map<String, String> metadata) {

    public AuditEvent {
        metadata = Map.copyOf(metadata);
    }

    public static AuditEvent success(String action, String entityType, String entityId) {
        return new AuditEvent(action, entityType, Optional.ofNullable(entityId),
                              AuditOutcome.SUCCESS, Map.of());
    }

    public static AuditEvent denied(String action, String entityType,
                                    Map<String, String> metadata) {
        return new AuditEvent(action, entityType, Optional.empty(),
                              AuditOutcome.DENIED, metadata);
    }
}
