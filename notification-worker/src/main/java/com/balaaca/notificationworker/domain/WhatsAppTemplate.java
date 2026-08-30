package com.balaaca.notificationworker.domain;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Which approved template carries which notification, and in what order its
 * parameters go.
 *
 * <p>Outside a twenty-four hour window opened by the customer, WhatsApp accepts
 * only templates approved by Meta in advance. Every message this product sends
 * is business-initiated, so every message is a template - and a template's body
 * takes positional parameters, not named ones. The order below IS the contract
 * with the approved template; changing it silently rewrites what customers read.
 *
 * <p>The names must match what Meta approved, exactly. A mismatch is answered
 * with error 132001 and the row goes to DEAD after its retries, which is the
 * right outcome and a slow way to learn about a typo.
 *
 * <p>This mapping lives in the channel and not on the notification row on
 * purpose. A row has to be sendable by SMS or email too, so it carries what the
 * message MEANS - the business, the service, the local time - and each channel
 * decides how to say it. Putting a template name in the row would make it a
 * WhatsApp row.
 */
public enum WhatsAppTemplate {

    BOOKING_CONFIRMATION("booking_confirmation", "business_name", "service_name", "starts_at_local"),
    REMINDER("booking_reminder", "business_name", "service_name", "starts_at_local"),
    CANCELLATION("booking_cancellation", "business_name", "service_name", "starts_at_local"),
    BOOKING_NOTICE("booking_notice", "customer_name", "service_name", "starts_at_local");

    private final String templateName;
    private final List<String> parameters;

    WhatsAppTemplate(String templateName, String... parameters) {
        this.templateName = templateName;
        this.parameters = List.of(parameters);
    }

    public String templateName() {
        return templateName;
    }

    /** @return the notification's kind, or empty when no template covers it */
    public static Optional<WhatsAppTemplate> forKind(String kind) {
        for (WhatsAppTemplate t : values()) {
            if (t.name().equals(kind)) {
                return Optional.of(t);
            }
        }
        return Optional.empty();
    }

    /**
     * The body parameters, in the template's own order.
     *
     * <p>A variable the row does not carry becomes an empty string rather than a
     * failure: WhatsApp refuses a template whose parameter count does not match,
     * so dropping one would turn a missing business name into an undelivered
     * message.
     */
    public List<String> parametersFrom(Map<String, String> payload) {
        return parameters.stream().map(k -> payload.getOrDefault(k, "")).toList();
    }
}
