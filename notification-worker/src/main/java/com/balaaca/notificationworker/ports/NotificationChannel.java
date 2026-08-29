package com.balaaca.notificationworker.ports;

import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;

/**
 * What actually carries a message out of the process.
 *
 * <p>No implementation of this talks to a real gateway yet. The one that ships
 * writes to the log, and the worker refuses to start unless a channel is named
 * explicitly - so a deployment cannot silently mark rows SENT that nobody
 * received.
 */
public interface NotificationChannel {

    /**
     * @param idempotencyKey the row's dedupe key, passed through so a crash
     *                       between the gateway's acknowledgement and the SENT
     *                       update costs a suppressed duplicate, not a second
     *                       message
     * @return the transport actually used, recorded on the row
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
