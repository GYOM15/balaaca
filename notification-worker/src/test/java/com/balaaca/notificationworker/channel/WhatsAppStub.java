package com.balaaca.notificationworker.channel;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A WhatsApp that answers.
 *
 * <p>The JDK's own HTTP server rather than a mocking framework: what is under
 * test is a request this project builds and a response it interprets, and both
 * are ordinary HTTP. A framework would add a dependency, a supply chain and a
 * layer of matchers between the test and the bytes actually sent.
 */
final class WhatsAppStub implements AutoCloseable {

    private final HttpServer server;
    private final List<String> bodies = new ArrayList<>();
    private final List<String> authorizations = new ArrayList<>();
    private final AtomicReference<Reply> reply = new AtomicReference<>(ok());

    record Reply(int status, String body) {
    }

    static Reply ok() {
        return new Reply(200, """
                {"messaging_product":"whatsapp",
                 "contacts":[{"input":"224622000001","wa_id":"224622000001"}],
                 "messages":[{"id":"wamid.TEST"}]}""");
    }

    /** The documented error envelope, with the code the drain loop reads. */
    static Reply error(int status, int code) {
        return new Reply(status, """
                {"error":{"message":"stubbed","type":"OAuthException","code":%d,
                          "fbtrace_id":"AaBbCc"}}""".formatted(code));
    }

    WhatsAppStub() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/", this::handle);
        server.start();
    }

    private void handle(HttpExchange exchange) throws IOException {
        synchronized (this) {
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorizations.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
        }
        Reply current = reply.get();
        byte[] out = current.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(current.status(), out.length);
        exchange.getResponseBody().write(out);
        exchange.close();
    }

    void answerWith(Reply next) {
        reply.set(next);
    }

    String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    synchronized List<String> bodies() {
        return List.copyOf(bodies);
    }

    synchronized List<String> authorizations() {
        return List.copyOf(authorizations);
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
