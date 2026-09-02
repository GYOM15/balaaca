package com.balaaca.notificationworker.adapters.outbound.channel;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.domain.EmailTemplate;
import com.balaaca.notificationworker.ports.ChannelNamed;
import com.balaaca.notificationworker.ports.NotificationChannel;
import io.quarkus.mailer.Mail;
import io.quarkus.mailer.Mailer;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Sends through the relay Keycloak already uses.
 *
 * <p>One SMTP account, one reputation, one place to change: the settings are
 * read from the {@code KEYCLOAK_SMTP_*} variables and nothing here has
 * variables of its own. Mailpit catches everything in development, and moving
 * to a real relay is four values in {@code .env} and no code.
 *
 * <p>Every message carries a plain text part beside the HTML one. That is not
 * politeness: a single-part HTML message is scored as spam by every filter that
 * matters, and this product's whole reason for offering e-mail is that a
 * pharmacist wants a confirmation that looks professional and arrives.
 *
 * <p>There is no idempotency key on SMTP, and none can be invented. RFC 5321
 * has no such field, and no receiver is obliged to suppress anything; a
 * deterministic {@code Message-ID} would only put an internal identifier in a
 * customer's mailbox in exchange for behaviour no specification promises. So
 * delivery is at-least-once with nothing underneath it: a crash between the
 * relay accepting the message and this worker marking the row SENT costs the
 * customer a duplicate. The window is the width of one UPDATE, and the dedupe
 * key still does the job it can, which is to stop a notification being PLANNED
 * twice.
 */
@ApplicationScoped
@ChannelNamed("smtp")
public class SmtpNotificationChannel implements NotificationChannel {

    private final Mailer mailer;

    /**
     * Configured, then demanded. Quarkus resolves the mailer settings whether
     * or not this channel is selected, and an unset or blank relay silently
     * becomes localhost on port 25 - which would claim rows, fail every send,
     * and walk the backlog to DEAD. This runs only when the router builds this
     * adapter, so a console-only deployment is unaffected and a misconfigured
     * e-mail deployment refuses to start instead.
     */
    public SmtpNotificationChannel(
            Mailer mailer,
            @ConfigProperty(name = "quarkus.mailer.host") Optional<String> host,
            @ConfigProperty(name = "quarkus.mailer.port") Optional<String> port,
            @ConfigProperty(name = "quarkus.mailer.from") Optional<String> from) {
        this.mailer = mailer;
        require(host, "quarkus.mailer.host (KEYCLOAK_SMTP_HOST)");
        require(port, "quarkus.mailer.port (KEYCLOAK_SMTP_PORT)");
        require(from, "quarkus.mailer.from (KEYCLOAK_SMTP_FROM)");
    }

    private static void require(Optional<String> value, String named) {
        if (value.filter(v -> !v.isBlank()).isEmpty()) {
            throw new IllegalStateException(
                    named + " is required when the smtp channel is selected");
        }
    }

    @Override
    public Set<Channel> transports() {
        return Set.of(Channel.EMAIL);
    }

    @Override
    public Channel send(ClaimedNotification n, String idempotencyKey) throws ChannelException {
        String recipient = n.toEmail()
                .orElseThrow(() -> new ChannelException("NO_EMAIL_ADDRESS", null));
        EmailTemplate template = EmailTemplate.forKind(n.kind())
                .orElseThrow(() -> new ChannelException("NO_TEMPLATE_FOR_KIND", null));

        Map<String, String> payload = NotificationPayload.of(n.payload());
        Mail mail = Mail.withHtml(recipient,
                                  template.subject(payload),
                                  BrandedEmail.html(template, payload))
                .setText(BrandedEmail.text(template, payload));

        try {
            mailer.send(mail);
        } catch (RuntimeException e) {
            // One code, and it is retryable. SMTP does separate a permanent
            // rejection from a temporary one, in the reply code, and reading it
            // would mean depending on the Vert.x exception type to learn that a
            // mailbox does not exist. Until that earns its keep, a bad address
            // spends its attempts and then goes DEAD with an alert, which is
            // the right terminal state reached slowly rather than the wrong one
            // reached fast.
            throw new ChannelException("SMTP_SEND_FAILED", e);
        }
        return Channel.EMAIL;
    }
}
