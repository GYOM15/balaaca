package com.balaaca.notificationworker.application;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import java.time.Clock;

/**
 * The one Clock this deployable injects. Business code never calls
 * {@code Instant.now()}: a decision that reads the system clock cannot be tested
 * at a boundary.
 */
@ApplicationScoped
public class ClockProducer {

    @Produces
    @ApplicationScoped
    public Clock systemClock() {
        return Clock.systemUTC();
    }
}
