package com.balaaca.platformkernel.tenancy;

import java.util.Objects;
import java.util.UUID;

/** The tenant. Never a request field: it is resolved server-side and ambient. */
public record ProviderId(UUID value) {

    public ProviderId {
        Objects.requireNonNull(value, "value");
    }

    public static ProviderId of(UUID value) {
        return new ProviderId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
