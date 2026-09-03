package com.balaaca.notificationworker.adapters.outbound.channel;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * The row's template variables, flattened to strings.
 *
 * <p>Shared by every channel because the row is shared: the planner writes one
 * payload under stable English keys and each transport decides how to say it.
 * Two copies of this parser would be two places for a key to be read
 * differently.
 */
final class NotificationPayload {

    private static final JsonFactory JSON = new JsonFactory();

    private NotificationPayload() {
    }

    static Map<String, String> of(String payload) {
        Map<String, String> values = new HashMap<>();
        try (JsonParser p = JSON.createParser(payload)) {
            while (p.nextToken() != null) {
                if (p.currentToken() == JsonToken.FIELD_NAME) {
                    String key = p.currentName();
                    p.nextToken();
                    values.put(key, p.getValueAsString(""));
                }
            }
        } catch (IOException | RuntimeException e) {
            // The row's own payload is unreadable. Nothing downstream can fix
            // that, and an empty map produces empty variables rather than a
            // message about a null.
            return Map.of();
        }
        return values;
    }
}
