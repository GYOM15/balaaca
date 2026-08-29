package com.balaaca.notificationworker.it;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.NotificationChannel;
import io.quarkus.arc.lookup.LookupIfProperty;
import jakarta.enterprise.context.ApplicationScoped;

/** A gateway that is always down, so the retry path can be driven at all. */
@ApplicationScoped
@LookupIfProperty(name = "balaaca.notification.channel", stringValue = "failing")
public class FailingNotificationChannel implements NotificationChannel {

    public static final String CODE = "GATEWAY_UNREACHABLE";

    @Override
    public Channel send(ClaimedNotification notification, String idempotencyKey)
            throws ChannelException {
        throw new ChannelException(CODE, new IllegalStateException("no gateway in a test"));
    }
}
