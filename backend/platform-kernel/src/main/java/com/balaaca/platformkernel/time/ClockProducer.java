package com.balaaca.platformkernel.time;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import java.time.Clock;

/**
 * The one Clock the application injects. Business code never calls
 * Instant.now(): a calculation that reads the system clock cannot be tested at
 * a boundary, and every interesting time bug lives at a boundary.
 */
@ApplicationScoped
public class ClockProducer {

    @Produces
    @ApplicationScoped
    public Clock systemClock() {
        return Clock.systemUTC();
    }
}
