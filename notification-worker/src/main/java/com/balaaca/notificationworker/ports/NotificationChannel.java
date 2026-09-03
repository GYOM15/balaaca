package com.balaaca.notificationworker.ports;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import java.util.Set;

/**
 * What actually carries a message out of the process.
 *
 * <p>An implementation carries one transport, or stands in for several. The
 * router picks one, narrows the row to the address that transport uses, and
 * hands it over; nothing here chooses, and nothing here falls back.
 */
public interface NotificationChannel {

    /**
     * Which transports this adapter can carry.
     *
     * <p>The router indexes the configured adapters by this, so an adapter that
     * claims a transport it cannot address would silently take that transport's
     * traffic away from one that can.
     */
    Set<Channel> transports();

    /**
     * @param notification    already narrowed to one transport: exactly one of
     *                        its two addresses is present, and it is the one
     *                        this adapter is being asked to use
     * @param idempotencyKey the row's dedupe key, passed through for channels
     *                       that accept one. Neither WhatsApp nor SMTP does, so
     *                       on both paths a crash between the acknowledgement
     *                       and the SENT update costs a real duplicate - said
     *                       here rather than assumed away
     * @return the transport actually used, recorded on the row as
     *         {@code channel_used}. It is the adapter's answer and not the
     *         router's request, because a row addressed one way and sent
     *         another is exactly what the column exists to record
     * @throws ChannelException when the message did not get through
     */
    Channel send(ClaimedNotification notification, String idempotencyKey) throws ChannelException;

    /**
     * A failure the drain loop can act on.
     *
     * <p>{@code failureCode} is a stable code minted here, never the provider's
     * own payload: it is written to {@code last_error}, which is read by people
     * looking for a pattern and must not carry a recipient or a token.
     */
    class ChannelException extends Exception {

        private final String failureCode;

        public ChannelException(String failureCode, Throwable cause) {
            super(failureCode, cause);
            this.failureCode = failureCode;
        }

        public String failureCode() {
            return failureCode;
        }
    }
}
