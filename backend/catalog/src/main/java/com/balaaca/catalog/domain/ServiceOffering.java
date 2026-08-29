package com.balaaca.catalog.domain;

import com.balaaca.sharedkernel.money.Money;
import java.time.Duration;
import java.util.UUID;

/**
 * A prestation a provider sells. The duration and buffers are what the server
 * uses to compute the slot: whatever a client sends for either is ignored.
 */
public record ServiceOffering(
        UUID id,
        String name,
        Duration duration,
        Duration bufferBefore,
        Duration bufferAfter,
        Money price,
        boolean active) {

    /** The window the calendar must hold free, wider than what the customer sees. */
    public Duration blockedDuration() {
        return bufferBefore.plus(duration).plus(bufferAfter);
    }
}
