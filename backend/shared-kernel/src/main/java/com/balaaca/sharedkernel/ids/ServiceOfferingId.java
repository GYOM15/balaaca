package com.balaaca.sharedkernel.ids;

import java.util.Objects;
import java.util.UUID;

public record ServiceOfferingId(UUID value) implements EntityId {

    public ServiceOfferingId {
        Objects.requireNonNull(value, "value");
    }

    public static ServiceOfferingId of(UUID value) {
        return new ServiceOfferingId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
