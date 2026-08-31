package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.booking.domain.NotificationKind;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A notification the core plans and the worker cannot send.
 *
 * <p>The same shape as {@link SchemaCoverageTest}, one seam further out. The
 * core writes a row carrying a KIND; the worker maps that kind to an approved
 * template and throws {@code NO_TEMPLATE_FOR_KIND} when it cannot. The row then
 * retries, exhausts its attempts and lands in DEAD - silently, because nothing
 * on the booking path fails and the customer simply never hears anything.
 *
 * <p>It had already happened twice. RESCHEDULE was planned from the day
 * rescheduling shipped and had no template, so a customer whose appointment
 * moved was never told. BOOKING_ACCEPTED was added precisely because confirming
 * a booking notified nobody - and it notified nobody either, for a different
 * reason, which is the kind of thing only a gate catches.
 *
 * <p>Read as text rather than by importing the enum, and that is deliberate:
 * {@code notification-worker} is a standalone deployable with no dependency on
 * the core - that separation is the whole point of an outbox - so no test can
 * hold both types at once. The file is the contract between them.
 */
class NotificationTemplateCoverageTest {

    private static final Path TEMPLATES = Path.of(
            "..", "..", "notification-worker", "src", "main", "java", "com", "balaaca",
            "notificationworker", "domain", "WhatsAppTemplate.java");

    @Test
    @DisplayName("Every kind the core plans has a template the worker can send")
    void everyKindIsSendable() {
        String source = read(TEMPLATES);

        // The enum constant, at the start of its own declaration. Matching the
        // bare word would be satisfied by a mention in a comment, which is
        // exactly how a gate stops being one.
        List<String> unsendable = Arrays.stream(NotificationKind.values())
                .map(Enum::name)
                .filter(kind -> !source.contains("\n    " + kind + "("))
                .toList();

        assertThat(unsendable)
                .describedAs("These kinds are written to the outbox and would go DEAD "
                             + "on the first drain. Add each one to WhatsAppTemplate, "
                             + "with the parameters its approved template takes.")
                .isEmpty();
    }

    @Test
    @DisplayName("Every template answers to a kind the core actually plans")
    void noTemplateIsOrphaned() {
        String source = read(TEMPLATES);
        List<String> planned = Arrays.stream(NotificationKind.values()).map(Enum::name).toList();

        // The other direction. A template for a kind nobody writes is an
        // approval request Meta was asked for and a message that will never be
        // sent - harmless, but it is a claim about the product that is not true.
        List<String> orphaned = source.lines()
                .map(String::stripLeading)
                .filter(line -> line.matches("^[A-Z][A-Z_]+\\(\".*"))
                .map(line -> line.substring(0, line.indexOf('(')))
                .filter(name -> !planned.contains(name))
                .toList();

        assertThat(orphaned).isEmpty();
    }

    @Test
    @DisplayName("Every kind the core plans is a kind the table accepts")
    void everyKindIsStorable() {
        // The third copy of the same list, and the one that fails LOUDLY rather
        // than silently: notifications_kind_check refuses the insert, the
        // booking transaction rolls back, and the customer is answered 500 for
        // an appointment that was otherwise fine. Found exactly that way.
        String check = latestKindCheck();
        List<String> unstorable = Arrays.stream(NotificationKind.values())
                .map(Enum::name)
                .filter(kind -> !check.contains("'" + kind + "'"))
                .toList();

        assertThat(unstorable)
                .describedAs("These kinds would be refused by notifications_kind_check, "
                             + "rolling back the transaction that planned them. Widen the "
                             + "constraint in a new migration.")
                .isEmpty();
    }

    /**
     * The constraint as the LAST migration to touch it leaves it.
     *
     * <p>Three migrations have redefined it and a fourth will; reading them all
     * and keeping the last is what makes this test right tomorrow rather than
     * only today.
     */
    private static String latestKindCheck() {
        try (Stream<Path> files = Files.list(Path.of("src/main/resources/db/migration"))) {
            return files.map(Path::toString).sorted()
                    .map(f -> read(Path.of(f)))
                    .filter(sql -> sql.contains("notifications_kind_check")
                                   || sql.contains("kind varchar(40)"))
                    .reduce((first, last) -> last)
                    .orElseThrow(() -> new AssertionError("no migration defines the kinds"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String read(Path path) {
        try {
            return Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
