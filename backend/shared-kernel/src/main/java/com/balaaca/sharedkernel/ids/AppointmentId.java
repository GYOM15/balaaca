package com.balaaca.sharedkernel.ids;

import java.util.Objects;
import java.util.UUID;

public record AppointmentId(UUID value) implements EntityId {

    public AppointmentId {
        Objects.requireNonNull(value, "value");
    }

    public static AppointmentId of(UUID value) {
        return new AppointmentId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
