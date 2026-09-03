package com.balaaca.notificationworker.it;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.ChannelNamed;
import com.balaaca.notificationworker.ports.NotificationChannel;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Set;

/** A gateway that is always down, so the retry path can be driven at all. */
@ApplicationScoped
@ChannelNamed("failing")
public class FailingNotificationChannel implements NotificationChannel {

    public static final String CODE = "GATEWAY_UNREACHABLE";

    @Override
    public Set<Channel> transports() {
        return Set.of(Channel.WHATSAPP, Channel.EMAIL);
    }

    @Override
    public Channel send(ClaimedNotification notification, String idempotencyKey)
            throws ChannelException {
        throw new ChannelException(CODE, new IllegalStateException("no gateway in a test"));
    }
}
