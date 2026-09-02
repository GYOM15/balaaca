package com.balaaca.booking.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.booking.domain.BookingExceptions.CustomerBlockedException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What a blocked customer is told, and what they are not told.
 *
 * <p>Asserted rather than assumed, because the whole value of this refusal is
 * in what it withholds. A message naming the block would tell the person they
 * have been refused by name, which is a conversation the provider chose not to
 * have; and a distinct code would let anybody test whether a number is blocked
 * by trying to book with it.
 */
class CustomerBlockedExceptionTest {

    @Test
    @DisplayName("It refuses without saying why, under the published code")
    void saysNothingItShouldNot() {
        var refusal = new CustomerBlockedException();

        // FORBIDDEN is in the closed catalogue and is what several other
        // refusals answer with. A code of its own would be an oracle.
        assertThat(refusal.code()).isEqualTo("FORBIDDEN");
        assertThat(refusal.status()).isEqualTo(403);
        assertThat(refusal.getMessage()).doesNotContainIgnoringCase("block");
        assertThat(refusal.getMessage()).doesNotContainIgnoringCase("bloqu");
        // Nothing about the person, and nothing to correlate on.
        assertThat(refusal.details()).isEmpty();
    }
}
