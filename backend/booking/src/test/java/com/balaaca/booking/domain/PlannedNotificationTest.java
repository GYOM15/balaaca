package com.balaaca.booking.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.balaaca.sharedkernel.ids.AppointmentId;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What may and may not become a row.
 *
 * <p>The worker's role is granted this one table and nothing else, so a row it
 * cannot act on is a message that quietly never arrives. Every refusal here is
 * a database constraint said earlier, where the reason can still be named.
 */
class PlannedNotificationTest {

    private static final AppointmentId APPOINTMENT =
            AppointmentId.of(UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001"));
    private static final Instant OWED_FOR = Instant.parse("2026-09-04T10:00:00Z");
    private static final Optional<String> PHONE = Optional.of("+224622000001");
    private static final Optional<String> EMAIL = Optional.of("mariama@example.gn");

    private static PlannedNotification planned(Optional<String> phone, Optional<String> email,
                                               ContactChannel channel) {
        return new PlannedNotification(APPOINTMENT, NotificationKind.BOOKING_CONFIRMATION,
                NotificationRecipient.CUSTOMER, phone, email, channel, "fr",
                Map.of("business_name", "Salon Fatou"), OWED_FOR, OWED_FOR);
    }

    @Test
    @DisplayName("A row addressed nowhere at all is refused by its reason, not by a constraint name")
    void nothingToSendTo() {
        assertThatThrownBy(() -> planned(Optional.empty(), Optional.empty(),
                                         ContactChannel.WHATSAPP))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("a notification needs a phone or an email");
    }

    @Test
    @DisplayName("A row whose chosen channel has no address is refused although the other one has")
    void theChosenChannelMustBeReachable() {
        // The subtler half, and the one ck_notifications_destination accepts:
        // both of these carry an address, just not the one that was chosen.
        // Planning them hands the worker a decision it was never given the
        // means to make and no way to report that it could not.
        assertThatThrownBy(() -> planned(Optional.empty(), EMAIL, ContactChannel.WHATSAPP))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("a WhatsApp notification needs a phone");
        assertThatThrownBy(() -> planned(PHONE, Optional.empty(), ContactChannel.EMAIL))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("an email notification needs an email");
    }

    @Test
    @DisplayName("A reachable row keeps both addresses, so the worker has something to fall back to")
    void bothAddressesTravel() {
        PlannedNotification row = planned(PHONE, EMAIL, ContactChannel.EMAIL);

        assertThat(row.preferredChannel()).isEqualTo(ContactChannel.EMAIL);
        assertThat(row.toEmail()).contains("mariama@example.gn");
        assertThat(row.toPhoneE164()).contains("+224622000001");
    }

    @Test
    @DisplayName("One address is enough when it is the chosen one")
    void oneAddressIsEnough() {
        assertThat(planned(PHONE, Optional.empty(), ContactChannel.WHATSAPP).preferredChannel())
                .isEqualTo(ContactChannel.WHATSAPP);
        assertThat(planned(Optional.empty(), EMAIL, ContactChannel.EMAIL).preferredChannel())
                .isEqualTo(ContactChannel.EMAIL);
    }

    @Test
    @DisplayName("The dedupe key is intent and instant, and the channel is not part of it")
    void theChannelIsNotIdentity() {
        // The same message planned twice, once each way, is still one message.
        // A key that moved with the channel would let the UNIQUE index accept
        // both and the customer read the confirmation twice.
        assertThat(planned(PHONE, EMAIL, ContactChannel.EMAIL).dedupeKey())
                .isEqualTo(planned(PHONE, EMAIL, ContactChannel.WHATSAPP).dedupeKey())
                .isEqualTo("appointment:aaaaaaaa-0000-0000-0000-000000000001"
                           + ":BOOKING_CONFIRMATION:" + OWED_FOR.getEpochSecond());
    }

    @Test
    @DisplayName("A row with no channel at all is refused before anything else looks at it")
    void theChannelIsRequired() {
        assertThatThrownBy(() -> planned(PHONE, EMAIL, null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("preferredChannel");
    }
}
