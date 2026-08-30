package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.app.api.model.ErrorCode;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The published error catalogue is closed, and this is what closes it.
 *
 * <p>{@link ErrorCode} is generated from META-INF/openapi.yaml, so every place
 * that builds a response body already has the enum for a type. The gap is
 * {@code DomainException}, whose code is a String: a context can invent
 * {@code APPOINTMENT_NOT_FOUND} in a corner of the domain, compile, ship, and
 * be found out only when a client hits that path and gets a 500 from the
 * mapper's conversion.
 *
 * <p>Reading the sources rather than the classpath is deliberate. The codes are
 * string literals in constructors; nothing in the bytecode exposes them as a
 * set, and instantiating every exception to ask would mean listing them here -
 * a list that drifts the first time someone adds one.
 */
class ErrorCatalogueTest {

    /** The modules are siblings of this one; the test runs from app/. */
    private static final Path BACKEND = Path.of("..");

    private static final Pattern DOMAIN_EXCEPTION_CODE =
            Pattern.compile("super\\(\\s*\"([A-Z][A-Z_]+)\"\\s*,");

    @Test
    @DisplayName("Every code a context can throw is one the contract publishes")
    void noContextInventsACode() {
        Set<String> published = Stream.of(ErrorCode.values()).map(ErrorCode::toString)
                .collect(java.util.stream.Collectors.toCollection(TreeSet::new));

        Set<String> thrown = thrownCodes();

        assertThat(thrown)
                .as("codes found in the sources under %s", BACKEND.toAbsolutePath().normalize())
                .isNotEmpty();
        assertThat(published)
                .as("a code a handler can throw but the contract does not publish "
                    + "is a code no client can branch on")
                .containsAll(thrown);
    }

    private static Set<String> thrownCodes() {
        Set<String> codes = new TreeSet<>();
        try (Stream<Path> sources = Files.walk(BACKEND)) {
            List<Path> java = sources
                    .filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> p.toString().contains("/src/main/java/"))
                    .toList();
            for (Path file : java) {
                Matcher m = DOMAIN_EXCEPTION_CODE.matcher(
                        Files.readString(file, StandardCharsets.UTF_8));
                while (m.find()) {
                    codes.add(m.group(1));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return codes;
    }
}
