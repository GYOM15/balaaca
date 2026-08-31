package com.balaaca.notificationworker.adapters.outbound.alert;

import io.quarkus.arc.DefaultBean;
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
 * <p>Chosen when balaaca.alerts.webhook-url is empty, which it is by default:
 * a platform that refused to start without an alerting destination would be a
 * platform nobody can run locally.
 */
@ApplicationScoped
@DefaultBean
public class LoggingAlertChannel implements AlertChannel {

    private static final Logger LOG = Logger.getLogger("balaaca.alert");

    @Override
    public void send(String kind, String message, Map<String, String> details) {
        LOG.errorf("alert kind=%s message=%s details=%s", kind, message, details);
    }
}
