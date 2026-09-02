package com.balaaca.notificationworker.it;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/** Reads what the catcher caught, over its own HTTP API. */
@ApplicationScoped
public class Mailpit {

    private static final JsonFactory JSON = new JsonFactory();

    private final HttpClient http = HttpClient.newHttpClient();
    private final String apiUrl;

    /**
     * Optional, and not a required property with an empty default. Quarkus
     * validates every bean's configuration at startup even when nothing injects
     * the bean, and {@link MailpitTestResource} is restricted to the one class
     * that needs a catcher, so a required property here stops every OTHER
     * integration test from booting. An empty default does not help: SmallRye
     * reads an empty value as a missing one and raises the same error.
     */
    public Mailpit(@ConfigProperty(name = MailpitTestResource.API_URL) Optional<String> apiUrl) {
        this.apiUrl = apiUrl.orElseThrow(() -> new IllegalStateException(
                "no mailpit: add @QuarkusTestResource(MailpitTestResource.class)"));
    }

    /** One message as the catcher decoded it: its subject, and both body parts. */
    public record Message(String id, String subject, String text, String html) {
    }

    public void clear() {
        send(HttpRequest.newBuilder(URI.create(apiUrl + "/api/v1/messages")).DELETE());
    }

    public List<Message> messages() {
        String listing = send(HttpRequest.newBuilder(URI.create(apiUrl + "/api/v1/messages")).GET());
        List<Message> messages = new ArrayList<>();
        for (String id : idsIn(listing)) {
            String body = send(HttpRequest.newBuilder(
                    URI.create(apiUrl + "/api/v1/message/" + id)).GET());
            messages.add(new Message(id,
                                     field(body, "Subject"),
                                     field(body, "Text"),
                                     field(body, "HTML")));
        }
        return messages;
    }

    /**
     * How many of the caught messages were addressed to this mailbox.
     *
     * <p>Through the catcher's own search rather than by reading a recipient
     * out of the message JSON: "Address" appears under From before it appears
     * under To, and a test that asserted the first one would pass while every
     * message went to the wrong person.
     */
    public int countAddressedTo(String address) {
        String found = send(HttpRequest.newBuilder(URI.create(
                apiUrl + "/api/v1/search?query="
                + java.net.URLEncoder.encode("to:" + address, java.nio.charset.StandardCharsets.UTF_8)))
                .GET());
        return idsIn(found).size();
    }

    /** Every "ID" in the listing, which mailpit returns newest first. */
    private static List<String> idsIn(String listing) {
        List<String> ids = new ArrayList<>();
        try (JsonParser p = JSON.createParser(listing)) {
            while (p.nextToken() != null) {
                if (p.currentToken() == JsonToken.FIELD_NAME && "ID".equals(p.currentName())) {
                    p.nextToken();
                    ids.add(p.getValueAsString());
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return ids;
    }

    /**
     * The first value under a field name, unescaped by the parser.
     *
     * <p>Going through a JSON parser rather than matching the raw response is
     * what makes an assertion about an accented character mean anything: the
     * server escapes what it likes, and a substring test would be testing the
     * escaping rather than the message.
     */
    private static String field(String json, String name) {
        try (JsonParser p = JSON.createParser(json)) {
            while (p.nextToken() != null) {
                if (p.currentToken() == JsonToken.FIELD_NAME && name.equals(p.currentName())) {
                    p.nextToken();
                    return p.getValueAsString("");
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return "";
    }

    private String send(HttpRequest.Builder request) {
        try {
            HttpResponse<String> response =
                    http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException("mailpit answered " + response.statusCode());
            }
            return response.body();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
