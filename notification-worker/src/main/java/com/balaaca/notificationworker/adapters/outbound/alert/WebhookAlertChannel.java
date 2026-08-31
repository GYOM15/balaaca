package com.balaaca.notificationworker.adapters.outbound.alert;

import io.quarkus.arc.lookup.LookupIfProperty;
import jakarta.enterprise.context.ApplicationScoped;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * A POST to wherever the operator pointed it.
 *
 * <p>Deliberately not a Telegram client, or a Slack one. All of them accept a
 * POST with a JSON body carrying a text field, and so does ntfy, and so does a
 * Discord hook, and so does whatever the operator writes themselves. Choosing
 * one for them would be choosing which application a founder in Conakry reads
 * on their telephone, which is not the platform's business.
 *
 * <p>The body carries both a plain sentence and the structured details, so a
 * channel that renders only text is readable and one that parses JSON is
 * useful.
 *
 * <p>Selected by name, the same way the WhatsApp channel is, rather than by the
 * presence of a URL. An annotation that matched "not empty" does not exist, and
 * a destination that switches itself on because somebody set a variable is a
 * destination nobody decided to use.
 */
@ApplicationScoped
@LookupIfProperty(name = "balaaca.alerts.channel", stringValue = "webhook")
public class WebhookAlertChannel implements AlertChannel {

    private static final Logger LOG = Logger.getLogger(WebhookAlertChannel.class);

    /**
     * Short on purpose. An alert that blocks the drain loop for thirty seconds
     * turns a notification problem into a throughput problem, and the log line
     * behind it means a slow destination costs visibility rather than delivery.
     */
    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final HttpClient http;
    private final URI endpoint;

    /**
     * Optional, and then required.
     *
     * <p>An empty default is read as absent by the configuration converter, so
     * a plain String here fails to start the worker even when this channel is
     * not the one selected - Quarkus resolves every bean's configuration, not
     * only the chosen one's.
     *
     * <p>And when it IS selected, a missing URL is a worker that would start,
     * drain, fail to alert about anything, and look healthy. So it refuses to
     * be built instead - the same shape the WhatsApp channel uses, and for the
     * same reason.
     */
    public WebhookAlertChannel(
            @ConfigProperty(name = "balaaca.alerts.webhook-url") java.util.Optional<String> url) {
        this.endpoint = URI.create(url.filter(u -> !u.isBlank()).orElseThrow(
                () -> new IllegalStateException(
                        "balaaca.alerts.webhook-url is required when the webhook "
                        + "alert channel is selected")));
        this.http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    }

    @Override
    public void send(String kind, String message, Map<String, String> details) {
        String body = "{\"kind\":" + quote(kind)
                + ",\"text\":" + quote("[balaaca] " + message)
                + ",\"details\":{" + details.entrySet().stream()
                        .map(e -> quote(e.getKey()) + ":" + quote(e.getValue()))
                        .collect(Collectors.joining(","))
                + "}}";

        try {
            HttpResponse<Void> response = http.send(
                    HttpRequest.newBuilder(endpoint)
                            .timeout(TIMEOUT)
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                            .build(),
                    HttpResponse.BodyHandlers.discarding());

            if (response.statusCode() >= 300) {
                LOG.errorf("alert.rejected kind=%s status=%d", kind, response.statusCode());
            }
        } catch (java.io.IOException e) {
            LOG.errorf(e, "alert.unreachable kind=%s", kind);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            LOG.errorf("alert.interrupted kind=%s", kind);
        }
    }

    /**
     * Hand-rolled rather than a serialiser, because the shape is three fields
     * and pulling a dependency into a satellite for it would be the larger
     * decision. Everything written here is minted by this codebase - a kind, a
     * sentence, and detail values that never include a recipient.
     */
    private static String quote(String raw) {
        StringBuilder out = new StringBuilder(raw.length() + 2).append('"');
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
        return out.append('"').toString();
    }
}
