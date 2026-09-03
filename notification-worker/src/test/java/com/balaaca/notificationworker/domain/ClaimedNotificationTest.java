package com.balaaca.notificationworker.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** What the row says about where it can go, before any channel is asked. */
class ClaimedNotificationTest {

    private static ClaimedNotification row(Channel preferred, String phone, String email) {
        return new ClaimedNotification(UUID.randomUUID(), UUID.randomUUID(),
                "BOOKING_CONFIRMATION",
                Optional.ofNullable(phone), Optional.ofNullable(email),
                preferred, "fr", "{}", "appointment:1:BOOKING_CONFIRMATION:1", 0);
    }

    @Test
    @DisplayName("A blank column is not an address")
    void blankIsNotAnAddress() {
        // ck_notifications_destination only demands one of the two be NOT NULL,
        // and '' satisfies it. Trusting the column would hand a gateway an
        // empty recipient six times before anybody heard about it.
        ClaimedNotification n = row(Channel.WHATSAPP, "", "   ");

        assertThat(n.toPhoneE164()).isEmpty();
        assertThat(n.toEmail()).isEmpty();
        assertThat(n.addressFor(Channel.WHATSAPP)).isEmpty();
        assertThat(n.addressFor(Channel.EMAIL)).isEmpty();
    }

    @Test
    @DisplayName("The chosen transport is tried first, the other one after it")
    void ordersThePreferredFirst() {
        assertThat(row(Channel.EMAIL, "+224622000001", "a@b.gn").transportOrder())
                .containsExactly(Channel.EMAIL, Channel.WHATSAPP);
        assertThat(row(Channel.WHATSAPP, "+224622000001", "a@b.gn").transportOrder())
                .containsExactly(Channel.WHATSAPP, Channel.EMAIL);
    }

    @Test
    @DisplayName("SMS is never routed to: no adapter, no account")
    void neverRoutesToSms() {
        assertThat(row(Channel.WHATSAPP, "+224622000001", "a@b.gn").transportOrder())
                .doesNotContain(Channel.SMS);
    }

    @Test
    @DisplayName("A narrowed row carries one address, so a channel cannot re-choose")
    void narrowsToOneAddress() {
        ClaimedNotification both = row(Channel.EMAIL, "+224622000001", "a@b.gn");

        ClaimedNotification byEmail = both.addressedBy(Channel.EMAIL);
        assertThat(byEmail.toEmail()).contains("a@b.gn");
        assertThat(byEmail.toPhoneE164()).isEmpty();

        ClaimedNotification byWhatsApp = both.addressedBy(Channel.WHATSAPP);
        assertThat(byWhatsApp.toPhoneE164()).contains("+224622000001");
        assertThat(byWhatsApp.toEmail()).isEmpty();
        // And it says what it is being asked to carry, not what was wanted.
        assertThat(byWhatsApp.preferredChannel()).isEqualTo(Channel.WHATSAPP);
    }

    @Test
    @DisplayName("Narrowing changes nothing else about the message")
    void keepsEverythingElse() {
        ClaimedNotification both = row(Channel.EMAIL, "+224622000001", "a@b.gn");
        ClaimedNotification narrowed = both.addressedBy(Channel.EMAIL);

        assertThat(narrowed.id()).isEqualTo(both.id());
        assertThat(narrowed.providerId()).isEqualTo(both.providerId());
        assertThat(narrowed.kind()).isEqualTo(both.kind());
        assertThat(narrowed.dedupeKey()).isEqualTo(both.dedupeKey());
        assertThat(narrowed.attempts()).isEqualTo(both.attempts());
        assertThat(narrowed.locale()).isEqualTo(both.locale());
        assertThat(narrowed.payload()).isEqualTo(both.payload());
    }
}
