package com.balaaca.notificationworker.adapters.outbound.channel;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.NotificationChannel;
import io.quarkus.arc.lookup.LookupIfProperty;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

/**
 * A channel that delivers nothing and says so.
 *
 * <p>It exists because the drain loop, the claim, the backoff and the DEAD state
 * are worth having correct before a gateway account exists - and because the
 * alternative, a half-written Twilio adapter with no credentials to test it
 * against, would be a guess wearing the shape of an implementation. Which
 * gateway this market wants, WhatsApp Business or an SMS aggregator, is a
 * decision with a price attached, not a detail to settle in code.
 *
 * <p>It only exists when {@code balaaca.notification.channel=console} is set
 * explicitly. There is no default, so a deployment that forgets to name a
 * channel fails at startup rather than marking rows SENT that nobody received.
 *
 * <p>It logs the row's id and provider, never the recipient: a phone number is
 * the customer's, and this log is not where it belongs.
 */
@ApplicationScoped
@LookupIfProperty(name = "balaaca.notification.channel", stringValue = "console")
public class ConsoleNotificationChannel implements NotificationChannel {

    private static final Logger LOG = Logger.getLogger(ConsoleNotificationChannel.class);

    @Override
    public Channel send(ClaimedNotification n, String idempotencyKey) {
        // The transport the row was addressed by, so channel_used stays truthful
        // about how it would have gone out.
        Channel channel = n.toPhoneE164().isPresent() ? Channel.WHATSAPP : Channel.EMAIL;
        LOG.infof("notification.console.delivered id=%s provider_id=%s kind=%s channel=%s",
                  n.id(), n.providerId(), n.kind(), channel);
        return channel;
    }
}
