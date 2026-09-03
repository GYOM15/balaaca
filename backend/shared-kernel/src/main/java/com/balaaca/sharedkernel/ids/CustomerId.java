package com.balaaca.sharedkernel.ids;

import java.util.Objects;
import java.util.UUID;

public record CustomerId(UUID value) implements EntityId {

    public CustomerId {
        Objects.requireNonNull(value, "value");
    }

    public static CustomerId of(UUID value) {
        return new CustomerId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
