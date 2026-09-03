package com.balaaca.notificationworker.adapters.outbound.channel;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.ChannelNamed;
import com.balaaca.notificationworker.ports.NotificationChannel;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Set;
import org.jboss.logging.Logger;

/**
 * A channel that delivers nothing and says so.
 *
 * <p>It is what development runs on, and it is what stops a message being
 * delivered by accident: a stack pointed at a real gateway sends real messages
 * to real customers the first time somebody seeds the database.
 *
 * <p>It stands in for every transport, so a deployment naming it alone drains
 * the whole table without touching the outside world. Where it is named beside
 * a real adapter the order decides: {@code smtp,console} sends e-mail for real
 * and writes the WhatsApp rows to the log.
 *
 * <p>It logs the row's id and provider, never the recipient: a phone number is
 * the customer's, and this log is not where it belongs.
 */
@ApplicationScoped
@ChannelNamed("console")
public class ConsoleNotificationChannel implements NotificationChannel {

    private static final Logger LOG = Logger.getLogger(ConsoleNotificationChannel.class);

    @Override
    public Set<Channel> transports() {
        return Set.of(Channel.WHATSAPP, Channel.EMAIL);
    }

    @Override
    public Channel send(ClaimedNotification n, String idempotencyKey) {
        // The row arrives narrowed to one transport, so the address it still
        // carries IS the one it was routed by, and channel_used stays truthful
        // about how the message would have gone out.
        Channel channel = n.toPhoneE164().isPresent() ? Channel.WHATSAPP : Channel.EMAIL;
        LOG.infof("notification.console.delivered id=%s provider_id=%s kind=%s channel=%s",
                  n.id(), n.providerId(), n.kind(), channel);
        return channel;
    }
}
