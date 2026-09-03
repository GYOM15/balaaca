package com.balaaca.notificationworker.it;

import io.quarkus.test.junit.QuarkusTestProfile;
import java.util.Map;

/**
 * Real e-mail, logged WhatsApp.
 *
 * <p>Both transports are configured, which is the whole point: a router with
 * one adapter can honour no choice, and the fallback has nowhere to fall. The
 * order matters too - smtp claims EMAIL, so console, which stands in for
 * everything, is left holding WHATSAPP.
 */
public class EmailChannelProfile implements QuarkusTestProfile {

    @Override
    public Map<String, String> getConfigOverrides() {
        return Map.of("balaaca.notification.channel", "smtp,console");
    }
}
