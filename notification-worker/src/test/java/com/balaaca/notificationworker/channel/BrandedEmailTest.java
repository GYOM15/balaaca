package com.balaaca.notificationworker.channel;

import static org.assertj.core.api.Assertions.assertThat;

import com.balaaca.notificationworker.adapters.outbound.channel.BrandedEmail;
import com.balaaca.notificationworker.domain.EmailTemplate;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/** What the message looks like, before any relay is involved. */
class BrandedEmailTest {

    private static final Map<String, String> PAYLOAD = Map.of(
            "business_name", "Salon Fatou",
            "customer_name", "Mariama B.",
            "service_name", "Tresses",
            "duration_minutes", "45",
            "starts_at_local", "04/09/2026 10:00",
            "booking_reference", "BAL-7C4K-2M9X");

    @ParameterizedTest
    @EnumSource(EmailTemplate.class)
    @DisplayName("Both parts are built for every kind, and neither is empty")
    void bothPartsAlways(EmailTemplate template) {
        assertThat(BrandedEmail.html(template, PAYLOAD)).isNotBlank().contains("<!DOCTYPE html>");
        // A message with no text part is scored as spam by every filter that
        // matters, so an empty one here is a delivery failure downstream.
        assertThat(BrandedEmail.text(template, PAYLOAD)).isNotBlank().doesNotContain("<");
    }

    @Test
    @DisplayName("Tables and inline hex, because a style block does not survive a forward")
    void drawnTheWayMailClientsRender() {
        String html = BrandedEmail.html(EmailTemplate.BOOKING_CONFIRMATION, PAYLOAD);

        assertThat(html).contains("<table role=\"presentation\"");
        // Each colour is the design token's own value, written out because no
        // mail client has ever supported a custom property.
        assertThat(html)
                .contains("#FAF8F2")   // --bg
                .contains("#123C35")   // --brand
                .contains("#E4E0D4")   // --border
                .contains("#7E6023");  // --accent-strong
        assertThat(html).doesNotContain("<style").doesNotContain("var(--");
    }

    @Test
    @DisplayName("The booking reference is printed where it is found, and only there")
    void carriesTheReferenceOnce() {
        // The planner puts it in the confirmation and in no other message: it is
        // the customer's key to their own appointment, and a reminder that
        // repeated it would be a second copy of a capability at rest.
        assertThat(BrandedEmail.text(EmailTemplate.BOOKING_CONFIRMATION, PAYLOAD))
                .contains("BAL-7C4K-2M9X");

        Map<String, String> withoutReference = Map.of(
                "business_name", "Salon Fatou",
                "customer_name", "Mariama B.",
                "service_name", "Tresses",
                "starts_at_local", "04/09/2026 10:00");
        assertThat(BrandedEmail.text(EmailTemplate.REMINDER, withoutReference))
                .doesNotContain("code de rendez-vous");
        assertThat(BrandedEmail.html(EmailTemplate.REMINDER, withoutReference))
                .doesNotContain("code de rendez-vous");
    }

    @Test
    @DisplayName("A salon called Chez B and B does not break the page")
    void escapesWhatTheCustomerWrote() {
        Map<String, String> hostile = Map.of(
                "business_name", "Chez B&B",
                "customer_name", "Mariama B.",
                "service_name", "<script>alert(1)</script>",
                "starts_at_local", "04/09/2026 10:00");

        String html = BrandedEmail.html(EmailTemplate.BOOKING_CONFIRMATION, hostile);

        assertThat(html).contains("Chez B&amp;B").doesNotContain("<script>");
    }

    @Test
    @DisplayName("The text part says the same things, in the order they are read")
    void theTextPartIsAMessageAndNotAStrippedPage() {
        String text = BrandedEmail.text(EmailTemplate.BOOKING_CONFIRMATION, PAYLOAD);

        assertThat(text)
                .contains("Votre rendez-vous est enregistré")
                .contains("Service : Tresses")
                .contains("Date : 04/09/2026 10:00")
                .contains("Durée : 45 minutes");
        // Why they got it, so a message nobody asked for is recognisable as one.
        assertThat(text).contains("Vous recevez ce message");
    }
}
