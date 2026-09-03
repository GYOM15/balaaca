package com.balaaca.notificationworker.channel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.balaaca.notificationworker.adapters.outbound.channel.WhatsAppNotificationChannel;
import com.balaaca.notificationworker.domain.Channel;
import com.balaaca.notificationworker.domain.ClaimedNotification;
import com.balaaca.notificationworker.ports.NotificationChannel.ChannelException;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What this project sends to WhatsApp, and what it makes of the answers.
 *
 * <p>Against a real HTTP server speaking the documented protocol, so the request
 * body is asserted as bytes rather than as a call to a mock. The account is the
 * only thing missing; the contract is not, and neither is this.
 */
class WhatsAppNotificationChannelTest {

    private WhatsAppStub stub;
    private WhatsAppNotificationChannel channel;

    @BeforeEach
    void start() {
        stub = new WhatsAppStub();
        channel = new WhatsAppNotificationChannel(stub.baseUrl(), "v21.0",
                Optional.of("123456"), Optional.of("a-token"));
    }

    @AfterEach
    void stop() {
        stub.close();
    }

    private static ClaimedNotification notification(String kind) {
        return new ClaimedNotification(
                UUID.randomUUID(), UUID.randomUUID(), kind,
                Optional.of("+224622000001"), Optional.empty(), Channel.WHATSAPP, "fr",
                """
                {"business_name":"Salon Fatou","service_name":"Tresses",
                 "starts_at_local":"04/09/2026 10:00","customer_name":"Mariama B."}""",
                "appointment:1:BOOKING_CONFIRMATION:1788516000", 0);
    }

    @Test
    @DisplayName("Sends the approved template, with its parameters in order")
    void sendsATemplate() throws Exception {
        assertThat(channel.send(notification("BOOKING_CONFIRMATION"), "key"))
                .isEqualTo(Channel.WHATSAPP);

        String body = stub.bodies().get(0);
        assertThat(body)
                .contains("\"messaging_product\":\"whatsapp\"")
                .contains("\"name\":\"booking_confirmation\"")
                .contains("\"code\":\"fr\"");
        // Positional, and in the template's order: WhatsApp numbers body
        // parameters, so swapping two of them swaps what the customer reads.
        assertThat(body.indexOf("Salon Fatou"))
                .isLessThan(body.indexOf("Tresses"))
                .isLessThan(body.indexOf("04/09/2026 10:00"));
        assertThat(stub.authorizations().get(0)).isEqualTo("Bearer a-token");
    }

    @Test
    @DisplayName("The number goes without its plus, which the API rejects")
    void stripsThePlus() throws Exception {
        channel.send(notification("REMINDER"), "key");

        assertThat(stub.bodies().get(0))
                .contains("\"to\":\"224622000001\"")
                .doesNotContain("+224622000001");
    }

    @Test
    @DisplayName("A rate limit is a retryable failure, so the row comes back")
    void rateLimitIsRetryable() {
        stub.answerWith(WhatsAppStub.error(429, 130429));

        assertThatThrownBy(() -> channel.send(notification("REMINDER"), "key"))
                .isInstanceOf(ChannelException.class)
                .satisfies(e -> assertThat(((ChannelException) e).failureCode())
                        .isEqualTo("WHATSAPP_RETRYABLE_130429"));
    }

    @Test
    @DisplayName("A template that does not exist is not worth retrying")
    void unknownTemplateIsTerminal() {
        stub.answerWith(WhatsAppStub.error(400, 132001));

        assertThatThrownBy(() -> channel.send(notification("REMINDER"), "key"))
                .isInstanceOf(ChannelException.class)
                .satisfies(e -> assertThat(((ChannelException) e).failureCode())
                        .isEqualTo("WHATSAPP_132001"));
    }

    @Test
    @DisplayName("The gateway's own message never becomes the failure code")
    void doesNotForwardTheProvidersText() {
        stub.answerWith(WhatsAppStub.error(400, 131026));

        assertThatThrownBy(() -> channel.send(notification("REMINDER"), "key"))
                .satisfies(e -> {
                    String code = ((ChannelException) e).failureCode();
                    // last_error is read by people looking for a pattern. A
                    // provider payload there carries a recipient and a trace id.
                    assertThat(code).doesNotContain("stubbed").doesNotContain("AaBbCc");
                    assertThat(code).isEqualTo("WHATSAPP_131026");
                });
    }

    @Test
    @DisplayName("A kind no approved template covers is refused before the call")
    void refusesAnUncoveredKind() {
        // Deliberately a string the core does not plan and never will, rather
        // than a real kind that happens to have no template yet. This test used
        // RESCHEDULE, which was true on the day it was written and stopped
        // being true the day that message was finally given a template - so a
        // fix turned a green test red for no reason of its own. The same shape
        // as the onboarding test that used "plomberie" as an example of a trade
        // that does not exist, until the trade was added.
        assertThatThrownBy(() -> channel.send(notification("A_KIND_NOBODY_PLANS"), "key"))
                .satisfies(e -> assertThat(((ChannelException) e).failureCode())
                        .isEqualTo("NO_TEMPLATE_FOR_KIND"));

        assertThat(stub.bodies()).isEmpty();
    }

    @Test
    @DisplayName("A 5xx is retryable whatever the body says")
    void serverErrorIsRetryable() {
        stub.answerWith(new WhatsAppStub.Reply(503, "<html>gateway</html>"));

        assertThatThrownBy(() -> channel.send(notification("REMINDER"), "key"))
                .satisfies(e -> assertThat(((ChannelException) e).failureCode())
                        .isEqualTo("WHATSAPP_HTTP_503"));
    }
}
