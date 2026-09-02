package com.balaaca.notificationworker.adapters.outbound.channel;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.domain.WhatsAppTemplate;
import com.balaaca.notificationworker.ports.ChannelNamed;
import com.balaaca.notificationworker.ports.NotificationChannel;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.IOException;
import java.io.StringWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Sends through the WhatsApp Business Platform.
 *
 * <p>Written against the published Graph API contract rather than against a
 * guess: the request shape, the error codes and their meanings are documented
 * and stable. What is not here is an account - so the base URL is configurable,
 * and until credentials exist the whole path runs against a stub that speaks the
 * same protocol. When they arrive, one URL changes.
 *
 * <p>There is no idempotency key on this API. That is worth stating plainly
 * because the drain loop's comment used to claim otherwise: delivery is
 * at-least-once, and a crash between WhatsApp acknowledging and this worker
 * marking the row SENT costs a duplicate message with nothing to suppress it.
 * The dedupe key stops a notification being PLANNED twice; it cannot stop one
 * being sent twice. The window is the width of one UPDATE.
 */
@ApplicationScoped
@ChannelNamed("whatsapp")
public class WhatsAppNotificationChannel implements NotificationChannel {

    private static final JsonFactory JSON = new JsonFactory();

    /**
     * The failures worth trying again. Everything else is the message being
     * wrong rather than the moment: retrying a template that does not exist
     * burns the row's whole attempt budget to arrive at the same answer.
     */
    private static final List<Integer> RETRYABLE = List.of(
            130429,  // rate limit hit
            131056,  // pair rate limit, this sender to this recipient
            133016,  // account temporarily blocked, a throttle in practice
            368);    // temporarily blocked for policy violations

    private final HttpClient http;
    private final String baseUrl;
    private final String apiVersion;
    private final String phoneNumberId;
    private final String accessToken;

    /**
     * Optional, then required. The properties are Optional because an empty
     * value reads as absent and would otherwise fail the whole application at
     * startup even when this channel is not the one selected; they are then
     * demanded here, which runs only when it is. A worker pointed at WhatsApp
     * with no number and no token would claim rows, fail every send, and walk
     * the backlog to DEAD - so it refuses to be built instead.
     */
    public WhatsAppNotificationChannel(
            @ConfigProperty(name = "balaaca.whatsapp.base-url") String baseUrl,
            @ConfigProperty(name = "balaaca.whatsapp.api-version") String apiVersion,
            @ConfigProperty(name = "balaaca.whatsapp.phone-number-id") Optional<String> phoneNumberId,
            @ConfigProperty(name = "balaaca.whatsapp.access-token") Optional<String> accessToken) {
        this.baseUrl = baseUrl;
        this.apiVersion = apiVersion;
        this.phoneNumberId = phoneNumberId.filter(v -> !v.isBlank()).orElseThrow(
                () -> new IllegalStateException("balaaca.whatsapp.phone-number-id is required "
                                                + "when the whatsapp channel is selected"));
        this.accessToken = accessToken.filter(v -> !v.isBlank()).orElseThrow(
                () -> new IllegalStateException("balaaca.whatsapp.access-token is required "
                                                + "when the whatsapp channel is selected"));
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Override
    public Set<Channel> transports() {
        return Set.of(Channel.WHATSAPP);
    }

    @Override
    public Channel send(ClaimedNotification n, String idempotencyKey) throws ChannelException {
        String recipient = n.toPhoneE164()
                .orElseThrow(() -> new ChannelException("NO_PHONE_NUMBER", null));
        WhatsAppTemplate template = WhatsAppTemplate.forKind(n.kind())
                .orElseThrow(() -> new ChannelException("NO_TEMPLATE_FOR_KIND", null));

        String body = requestBody(recipient, template,
                                  NotificationPayload.of(n.payload()), n.locale());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("%s/%s/%s/messages".formatted(baseUrl, apiVersion, phoneNumberId)))
                .header("Authorization", "Bearer " + accessToken)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(15))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            // The gateway did not answer. It may well have received the message,
            // so this is retryable and the duplicate is the cost of that.
            throw new ChannelException("GATEWAY_UNREACHABLE", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ChannelException("INTERRUPTED", e);
        }

        if (response.statusCode() / 100 == 2) {
            return Channel.WHATSAPP;
        }
        throw failureOf(response);
    }

    /**
     * A stable code, never the provider's own message.
     *
     * <p>It is written to last_error, which people read looking for a pattern.
     * A gateway payload there would carry a recipient, a trace id and whatever
     * else Meta decided to include that week.
     */
    private static ChannelException failureOf(HttpResponse<String> response) {
        Optional<Integer> code = errorCode(response.body());
        boolean retryable = response.statusCode() / 100 == 5
                || code.map(RETRYABLE::contains).orElse(false);

        String failure = code.map(c -> (retryable ? "WHATSAPP_RETRYABLE_" : "WHATSAPP_") + c)
                .orElse("WHATSAPP_HTTP_" + response.statusCode());

        // A terminal failure still throws: the drain loop counts the attempt and
        // the row reaches DEAD, which is where a message nobody can deliver
        // belongs. Giving up sooner would need a second outcome on the port, and
        // the attempt cap already bounds it.
        return new ChannelException(failure, null);
    }

    private static Optional<Integer> errorCode(String body) {
        try (JsonParser p = JSON.createParser(body)) {
            boolean inError = false;
            while (p.nextToken() != null) {
                if (p.currentToken() == JsonToken.FIELD_NAME) {
                    String name = p.currentName();
                    if ("error".equals(name)) {
                        inError = true;
                    } else if (inError && "code".equals(name)) {
                        p.nextToken();
                        return Optional.of(p.getIntValue());
                    }
                }
            }
        } catch (IOException | RuntimeException e) {
            // A body that is not the documented shape tells us nothing about
            // whether to retry, so the status alone decides.
            return Optional.empty();
        }
        return Optional.empty();
    }

    /**
     * E.164 without the plus: the API takes a bare number and rejects the
     * canonical form the rest of this system stores.
     */
    private static String toWhatsAppNumber(String e164) {
        return e164.startsWith("+") ? e164.substring(1) : e164;
    }

    private static String requestBody(String recipient, WhatsAppTemplate template,
                                      Map<String, String> payload, String locale) {
        StringWriter out = new StringWriter();
        try (JsonGenerator g = JSON.createGenerator(out)) {
            g.writeStartObject();
            g.writeStringField("messaging_product", "whatsapp");
            g.writeStringField("to", toWhatsAppNumber(recipient));
            g.writeStringField("type", "template");
            g.writeObjectFieldStart("template");
            g.writeStringField("name", template.templateName());
            g.writeObjectFieldStart("language");
            g.writeStringField("code", locale);
            g.writeEndObject();
            g.writeArrayFieldStart("components");
            g.writeStartObject();
            g.writeStringField("type", "body");
            g.writeArrayFieldStart("parameters");
            for (String value : template.parametersFrom(payload)) {
                g.writeStartObject();
                g.writeStringField("type", "text");
                g.writeStringField("text", value);
                g.writeEndObject();
            }
            g.writeEndArray();
            g.writeEndObject();
            g.writeEndArray();
            g.writeEndObject();
        } catch (IOException e) {
            throw new IllegalStateException("writing to a string cannot fail", e);
        }
        return out.toString();
    }
}
