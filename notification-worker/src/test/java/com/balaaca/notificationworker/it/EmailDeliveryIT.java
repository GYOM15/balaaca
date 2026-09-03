package com.balaaca.notificationworker.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.notificationworker.application.NotificationDrainJob;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import java.util.UUID;
import org.eclipse.microprofile.config.ConfigProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The customer's choice, against a real database and a real SMTP server.
 *
 * <p>Nothing here is mocked, and that is deliberate on both sides. The claim,
 * the fallback and the DEAD state are properties of statements PostgreSQL
 * executes; the multipart body, the encoding and the recipient are properties
 * of what a mail server actually accepted. A test double would have agreed to
 * both without checking either.
 */
@QuarkusTest
@TestProfile(EmailChannelProfile.class)
@QuarkusTestResource(PostgresTestResource.class)
@QuarkusTestResource(value = MailpitTestResource.class, restrictToAnnotatedClass = true)
class EmailDeliveryIT {

    private static final String INBOX = "mariama@example.gn";
    private static final String PHONE = "+224622000001";

    @Inject
    OutboxFixtures fixtures;

    @Inject
    Mailpit mailpit;

    @Inject
    NotificationDrainJob drain;

    @BeforeEach
    void seed() {
        fixtures.reset();
        mailpit.clear();
    }

    @Test
    @DisplayName("A customer who asked for e-mail is sent an e-mail")
    void honoursTheChoice() {
        UUID id = fixtures.addressed(OutboxFixtures.SALON, "appointment:20:BOOKING_CONFIRMATION:1",
                                     "BOOKING_CONFIRMATION", "EMAIL", PHONE, INBOX);

        drain.drain();

        assertThat(fixtures.status(id)).isEqualTo("SENT");
        // The row carries a telephone number too. What decides is the choice,
        // not what happens to be present.
        assertThat(fixtures.channelUsed(id)).isEqualTo("EMAIL");
        assertThat(mailpit.countAddressedTo(INBOX)).isEqualTo(1);
    }

    @Test
    @DisplayName("A customer who asked for WhatsApp is not sent an e-mail")
    void honoursTheOtherChoice() {
        UUID id = fixtures.addressed(OutboxFixtures.SALON, "appointment:21:BOOKING_CONFIRMATION:1",
                                     "BOOKING_CONFIRMATION", "WHATSAPP", PHONE, INBOX);

        drain.drain();

        assertThat(fixtures.status(id)).isEqualTo("SENT");
        assertThat(fixtures.channelUsed(id)).isEqualTo("WHATSAPP");
        // Both addresses were on the row and the mailbox was left alone.
        assertThat(mailpit.messages()).isEmpty();
    }

    @Test
    @DisplayName("A choice with no address behind it falls back, and the row says so")
    void fallsBackToWhatIsThere() {
        // The blank column is the interesting one: ck_notifications_destination
        // accepts it because the OTHER address is present, so this row reaches
        // the worker looking deliverable by e-mail and is not.
        UUID id = fixtures.addressed(OutboxFixtures.SALON, "appointment:22:REMINDER:1",
                                     "REMINDER", "EMAIL", PHONE, "");

        drain.drain();

        assertThat(fixtures.status(id)).isEqualTo("SENT");
        // preferred_channel still says EMAIL. channel_used is the outcome, and
        // the two disagreeing is exactly what a fallback looks like.
        assertThat(fixtures.channelUsed(id)).isEqualTo("WHATSAPP");
        assertThat(mailpit.messages()).isEmpty();
    }

    @Test
    @DisplayName("A WhatsApp choice with no number falls back to the mailbox")
    void fallsBackToEmail() {
        // Blank and not NULL, because ck_notifications_reachable refuses a
        // WHATSAPP row with a NULL number outright. The blank string is the one
        // shape of "no address" the schema still lets through, which is why the
        // worker treats it as absent rather than trusting the column.
        UUID id = fixtures.addressed(OutboxFixtures.SALON, "appointment:23:CANCELLATION:1",
                                     "CANCELLATION", "WHATSAPP", "", INBOX);

        drain.drain();

        assertThat(fixtures.channelUsed(id)).isEqualTo("EMAIL");
        assertThat(mailpit.countAddressedTo(INBOX)).isEqualTo(1);
    }

    @Test
    @DisplayName("A row no transport can address is DEAD at once, not in an hour")
    void undeliverableGoesDead() {
        UUID id = fixtures.addressed(OutboxFixtures.SALON, "appointment:24:REMINDER:1",
                                     "REMINDER", "WHATSAPP", "", "");

        drain.drain();

        assertThat(fixtures.status(id)).isEqualTo("DEAD");
        // One attempt, not six. The row is not coming back, and spending the
        // budget first would only delay the alert by an hour.
        assertThat(fixtures.attempts(id)).isEqualTo(1);
        assertThat(fixtures.lastError(id)).isEqualTo("NO_RECIPIENT_ADDRESS");
        // And it is terminal: the next drain must not pick it up again.
        drain.drain();
        assertThat(fixtures.attempts(id)).isEqualTo(1);
    }

    @Test
    @DisplayName("Keycloak's STARTTLS boolean reaches Vert.x as the mode it means")
    void translatesTheStartTlsBoolean() {
        // quarkus.mailer.start-tls is
        // ${balaaca.mailer.starttls.${KEYCLOAK_SMTP_STARTTLS:false}:OPTIONAL},
        // and the nested lookup failing would leave OPTIONAL, which against a
        // catcher advertising no STARTTLS is indistinguishable from DISABLED.
        // The two differ only in front of a real relay, which is the one place
        // nobody wants to find out.
        assertThat(ConfigProvider.getConfig().getValue("quarkus.mailer.start-tls", String.class))
                .isEqualTo("DISABLED");
    }

    @Test
    @DisplayName("The message carries both parts, and looks like the product")
    void carriesBothParts() {
        fixtures.addressed(OutboxFixtures.SALON, "appointment:25:BOOKING_CONFIRMATION:1",
                           "BOOKING_CONFIRMATION", "EMAIL", null, INBOX);

        drain.drain();

        Mailpit.Message message = mailpit.messages().get(0);
        assertThat(message.subject()).isEqualTo("Votre rendez-vous chez Salon Fatou");

        // A message with no text part is scored as spam by every filter that
        // matters, so its absence is a delivery failure and not a cosmetic one.
        assertThat(message.text())
                .contains("Service : Tresses")
                .contains("Date : 04/09/2026 10:00")
                .contains("Durée : 45 minutes")
                .contains("BAL-7C4K-2M9X")
                .doesNotContain("<table");

        // Tables and inline hex, because a <style> block does not survive a
        // forward in Gmail and no client supports a custom property. The colour
        // asserted is --brand, drawn from the design system by hand.
        assertThat(message.html())
                .contains("<table")
                .contains("#123C35")
                .contains("Salon Fatou")
                .contains("Tresses");

        // The accent survived the transfer encoding, which is the part a mocked
        // mailer would never have proven.
        assertThat(message.html()).contains("Durée");
    }
}
