package com.balaaca.booking.domain;

import com.balaaca.sharedkernel.phone.PhoneNumber;
import java.util.Objects;
import java.util.Optional;

/**
 * How a customer is reached. The phone is a parsed {@link PhoneNumber}, not a
 * string: the whole point of parsing it at the edge is that nothing downstream
 * has to wonder whether it is normalised, and flattening it back to a string
 * would throw away the only proof that it is.
 *
 * <p>Email is optional by design. Requiring one is friction this product does
 * not need, and a customer who books by phone has no reason to have one.
 */
public record CustomerContact(String fullName, PhoneNumber phone, Optional<String> email) {

    public CustomerContact {
        Objects.requireNonNull(fullName, "fullName");
        Objects.requireNonNull(phone, "phone");
        Objects.requireNonNull(email, "email");
        if (fullName.isBlank()) {
            throw new IllegalArgumentException("fullName must not be blank");
        }
    }
}
