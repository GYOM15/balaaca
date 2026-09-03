package com.balaaca.notificationworker.it;

import io.quarkus.test.junit.QuarkusTestProfile;
import java.util.Map;

/** Swaps the console channel for one that always fails. */
public class FailingChannelProfile implements QuarkusTestProfile {

    @Override
    public Map<String, String> getConfigOverrides() {
        return Map.of("balaaca.notification.channel", "failing");
    }
}
