package com.balaaca.notificationworker.adapters.outbound.alert;

import java.util.Map;

/** Where an alert actually goes. One implementation is selected by configuration. */
public interface AlertChannel {

    void send(String kind, String message, Map<String, String> details);
}
