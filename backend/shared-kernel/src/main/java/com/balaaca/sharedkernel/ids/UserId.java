package com.balaaca.sharedkernel.ids;

import java.util.Objects;
import java.util.UUID;

/**
 * A platform account, which is not the same thing as a person a customer books.
 * A {@code StaffId} is a bookable chair and may carry no account at all; this is
 * the row a Keycloak subject resolves to.
 */
public record UserId(UUID value) implements EntityId {

    public UserId {
        Objects.requireNonNull(value, "value");
    }

    public static UserId of(UUID value) {
        return new UserId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
