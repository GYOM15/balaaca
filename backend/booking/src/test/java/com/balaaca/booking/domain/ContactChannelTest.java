package com.balaaca.booking.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.balaaca.booking.domain.BookingExceptions.EmailChannelWithoutAddressException;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Who chooses, and what the choice costs.
 *
 * <p>Three rules and none of them needs a database: an absent answer means what
 * it has always meant, a chosen one is taken, and a choice the contact cannot
 * honour is refused at the edge rather than discovered by a worker hours later
 * with nobody to answer.
 */
class ContactChannelTest {

    private static final Optional<String> AN_ADDRESS = Optional.of("mariama@example.gn");
    private static final Optional<String> NO_ADDRESS = Optional.empty();

    @Test
    @DisplayName("An absent choice is WhatsApp, which is what every earlier caller meant")
    void absentMeansWhatsApp() {
        // Additive within /v1: a client written before this field existed sends
        // nothing, and nothing must keep meaning what it did.
        assertThat(ContactChannel.chosen(Optional.empty(), NO_ADDRESS))
                .isEqualTo(ContactChannel.WHATSAPP);
        assertThat(ContactChannel.chosen(Optional.empty(), AN_ADDRESS))
                .isEqualTo(ContactChannel.WHATSAPP);
    }

    @Test
    @DisplayName("A stated choice is taken, both ways")
    void aStatedChoiceIsTaken() {
        assertThat(ContactChannel.chosen(Optional.of(ContactChannel.WHATSAPP), NO_ADDRESS))
                .isEqualTo(ContactChannel.WHATSAPP);
        assertThat(ContactChannel.chosen(Optional.of(ContactChannel.EMAIL), AN_ADDRESS))
                .isEqualTo(ContactChannel.EMAIL);
    }

    @Test
    @DisplayName("Email with no address is refused here, not when the message falls due")
    void emailNeedsAnAddress() {
        assertThatThrownBy(() -> ContactChannel.chosen(Optional.of(ContactChannel.EMAIL),
                                                       NO_ADDRESS))
                .isInstanceOf(EmailChannelWithoutAddressException.class)
                .hasMessageContaining("email address is required");
    }

    @Test
    @DisplayName("WhatsApp does not need an email, and asking for one would refuse every booking")
    void whatsAppIsUnaffectedByTheAddress() {
        // The guard has to name the channel it is about. One that fired on a
        // missing email whatever was chosen would turn the optional address
        // into a required one for everybody.
        assertThat(ContactChannel.chosen(Optional.of(ContactChannel.WHATSAPP), NO_ADDRESS))
                .isEqualTo(ContactChannel.WHATSAPP);
    }

    @Test
    @DisplayName("A destination is read at whichever address it published")
    void aDestinationIsReadAtWhatItPublished() {
        // The provider's own notices. A salon that gave only a mailbox is
        // reached there, and stamping WhatsApp on that row would be a message
        // with nowhere to go.
        assertThat(ContactChannel.reachableAt(Optional.of("+224622999001")))
                .isEqualTo(ContactChannel.WHATSAPP);
        assertThat(ContactChannel.reachableAt(Optional.empty()))
                .isEqualTo(ContactChannel.EMAIL);
    }

    @Test
    @DisplayName("Only what can be delivered is offered")
    void smsIsNotAChoice() {
        // SMS is in the worker's channel_used vocabulary and has no adapter and
        // no account behind it. Offering it would let a customer pick a channel
        // nothing can send on, which is a promise the platform cannot keep.
        assertThat(ContactChannel.values())
                .containsExactly(ContactChannel.WHATSAPP, ContactChannel.EMAIL);
    }
}
