package com.balaaca.sharedkernel.ids;

import java.util.Objects;
import java.util.UUID;

public record StaffId(UUID value) implements EntityId {

    public StaffId {
        Objects.requireNonNull(value, "value");
    }

    public static StaffId of(UUID value) {
        return new StaffId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
