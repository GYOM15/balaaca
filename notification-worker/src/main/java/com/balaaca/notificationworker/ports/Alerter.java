package com.balaaca.notificationworker.ports;

import java.util.Map;

/**
 * Something an operator has to be told, rather than something they could find.
 *
 * <p>The drain loop already logs a dead notification at ERROR with the provider,
 * the kind and the dedupe key. That is enough to search a log aggregator, and
 * it is not enough to wake anybody: the row stops moving, the customer is never
 * told their appointment moved, and the first person to notice is the customer.
 *
 * <p>A port and not a client, because the destination is the operator's choice.
 * A Telegram bot, a Discord hook, an ntfy topic and a company Slack all accept
 * the same shape - a POST with a body - and the platform has no business
 * deciding which of them a founder in Conakry reads on their telephone.
 */
public interface Alerter {

    /**
     * @param kind what happened, as a stable machine-readable token. It is also
     *             the throttling key: an outage produces one dead row per
     *             message and a channel that receives four hundred of them is a
     *             channel somebody mutes, after which nothing is alerting at all
     * @param summary one sentence a person reads on a telephone screen
     * @param details never a recipient, never a phone number. An alert lands in
     *                whatever the operator pointed it at, and that is not a
     *                place a customer's number belongs
     */
    void raise(String kind, String summary, Map<String, String> details);
}
