package com.balaaca.notificationworker.adapters.outbound.alert;

import io.quarkus.arc.lookup.LookupIfProperty;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Map;
import org.jboss.logging.Logger;

/**
 * The default, and honest about what it is.
 *
 * <p>It writes the alert to the log at ERROR and nothing more, which is what
 * the worker already did. Selecting it changes nothing except that the message
 * is now shaped like an alert - so an operator who has not configured a
 * destination has not silently lost anything, and the day they configure one
 * the same events start arriving on their telephone.
 *
 * <p>Chosen by balaaca.alerts.channel=log, which is the default: a platform
 * that refused to start without an alerting destination would be a platform
 * nobody can run locally.
 *
 * <p>Selected by the same property as the webhook, and not by {@code @DefaultBean}.
 * A default bean is decided at BUILD time and the webhook exists at build time
 * whatever the configuration says, so this one was dropped from the container
 * altogether; then @LookupIfProperty made the webhook unresolvable at runtime,
 * and every alert died with an UnsatisfiedResolutionException that
 * ThrottledAlerter caught and logged. The dead-notification alert the outbox
 * doctrine asks for reached nobody, and the only sign of it was one line saying
 * alert.undeliverable.
 */
@ApplicationScoped
@LookupIfProperty(name = "balaaca.alerts.channel", stringValue = "log")
public class LoggingAlertChannel implements AlertChannel {

    private static final Logger LOG = Logger.getLogger("balaaca.alert");

    @Override
    public void send(String kind, String message, Map<String, String> details) {
        LOG.errorf("alert kind=%s message=%s details=%s", kind, message, details);
    }
}
