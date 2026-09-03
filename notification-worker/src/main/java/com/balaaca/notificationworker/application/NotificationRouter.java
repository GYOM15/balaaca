package com.balaaca.notificationworker.application;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.ChannelNamed;
import com.balaaca.notificationworker.ports.NotificationChannel;
import com.balaaca.notificationworker.ports.NotificationChannel.ChannelException;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.inject.Any;
import jakarta.enterprise.inject.Instance;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Sends a message the way the person receiving it asked to be reached.
 *
 * <p>One channel bean could not do this any more. The customer now chooses at
 * the moment of booking, the choice is frozen onto the appointment and copied
 * onto every row planned from it, and two rows in one batch may want different
 * transports. So the drain loop asks this, and this asks a channel.
 *
 * <p>Three rules, and the second is the reason the port returns a transport at
 * all:
 *
 * <ol>
 *   <li>send by the transport the recipient chose;</li>
 *   <li>when the row carries no address for it, send by the other one and
 *       record what was ACTUALLY used, because {@code channel_used} is the
 *       outcome and {@code preferred_channel} is the intention;</li>
 *   <li>when no transport has an address, the row can never be delivered, so it
 *       is dead now rather than in an hour and sixteen attempts.</li>
 * </ol>
 *
 * <p>A gateway that answers no is NOT a reason to fall back. The address was
 * right, the moment was wrong, and re-addressing the message would send a
 * customer who asked for e-mail a WhatsApp because Gmail was briefly busy. That
 * is a retry, and the drain loop already owns retries.
 */
@ApplicationScoped
public class NotificationRouter {

    private final Instance<NotificationChannel> channels;
    private final List<String> configured;

    /** Which adapter carries which transport, resolved once at startup. */
    private final Map<Channel, NotificationChannel> byTransport = new EnumMap<>(Channel.class);

    public NotificationRouter(
            @Any Instance<NotificationChannel> channels,
            @ConfigProperty(name = "balaaca.notification.channel")
            Optional<List<String>> configured) {
        this.channels = channels;
        this.configured = configured.orElse(List.of());
    }

    /**
     * Fail at startup rather than at the first drain. A worker with no channel,
     * or one naming an adapter that is not on the classpath, would otherwise
     * run happily, claim rows, throw on each, and burn every attempt until the
     * whole backlog is DEAD.
     *
     * <p>The property is a list and the order in it is precedence: the first
     * adapter that claims a transport keeps it. That is what lets a deployment
     * say {@code smtp,console} and send e-mail for real while the WhatsApp rows
     * only reach the log.
     */
    void wire(@Observes StartupEvent startup) {
        if (configured.isEmpty()) {
            throw new IllegalStateException(
                    "balaaca.notification.channel names no channel; "
                    + "the worker will not run without one");
        }
        for (String name : configured) {
            Instance<NotificationChannel> selected =
                    channels.select(NotificationChannel.class, ChannelNamed.Literal.of(name.trim()));
            if (selected.isUnsatisfied()) {
                throw new IllegalStateException(
                        "balaaca.notification.channel names '" + name.trim()
                        + "', which is not an available channel");
            }
            NotificationChannel channel = selected.get();
            channel.transports().forEach(t -> byTransport.putIfAbsent(t, channel));
        }
    }

    /**
     * @return the transport the message actually went out on
     * @throws UndeliverableException when no transport has an address to try
     * @throws ChannelException       when the transport that was tried refused
     */
    public Channel dispatch(ClaimedNotification n)
            throws ChannelException, UndeliverableException {

        boolean addressable = false;
        for (Channel transport : n.transportOrder()) {
            if (n.addressFor(transport).isEmpty()) {
                continue;
            }
            addressable = true;
            NotificationChannel channel = byTransport.get(transport);
            if (channel != null) {
                // Narrowed to one address, so the adapter cannot re-choose and
                // the transport it reports back is the one it was handed.
                return channel.send(n.addressedBy(transport), n.dedupeKey());
            }
        }
        if (!addressable) {
            throw new UndeliverableException("NO_RECIPIENT_ADDRESS");
        }
        // The row is addressable and this deployment has no adapter for it: a
        // configuration gap, not a dead message. Retrying is right, because
        // adding the missing adapter is what fixes it and the backlog should
        // still be there when somebody does.
        throw new ChannelException("NO_CHANNEL_FOR_TRANSPORT", null);
    }

    /**
     * The row can never be delivered, by this deployment or any other.
     *
     * <p>Kept apart from {@link ChannelException} because the two ask the drain
     * loop for opposite things: one for another attempt later, this one for no
     * further attempt at all.
     */
    public static class UndeliverableException extends Exception {

        private final String failureCode;

        public UndeliverableException(String failureCode) {
            super(failureCode);
            this.failureCode = failureCode;
        }

        public String failureCode() {
            return failureCode;
        }
    }
}
