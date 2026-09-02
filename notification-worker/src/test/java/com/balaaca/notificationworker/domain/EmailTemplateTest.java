package com.balaaca.notificationworker.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/** What a customer reads, and what happens when the row does not carry it. */
class EmailTemplateTest {

    private static final Map<String, String> CUSTOMER = Map.of(
            "business_name", "Salon Fatou",
            "customer_name", "Mariama B.",
            "service_name", "Tresses",
            "duration_minutes", "45",
            "starts_at_local", "04/09/2026 10:00");

    @ParameterizedTest
    @EnumSource(WhatsAppTemplate.class)
    @DisplayName("Every kind WhatsApp can carry, e-mail can carry too")
    void coversEveryKind(WhatsAppTemplate whatsapp) {
        // The two enums are the worker's whole vocabulary of kinds. A kind added
        // to one and forgotten in the other is a customer who chose e-mail and
        // gets nothing, six attempts and an alert later.
        assertThat(EmailTemplate.forKind(whatsapp.name())).isPresent();
    }

    @ParameterizedTest
    @EnumSource(EmailTemplate.class)
    @DisplayName("Nothing reaches a reader with a brace still in it")
    void substitutesEveryPlaceholder(EmailTemplate template) {
        assertThat(template.subject(CUSTOMER)).doesNotContain("{").isNotBlank();
        assertThat(template.heading(CUSTOMER)).doesNotContain("{").isNotBlank();
        assertThat(template.lead(CUSTOMER)).doesNotContain("{").isNotBlank();
    }

    @Test
    @DisplayName("The subject names the business, so an inbox list is readable")
    void namesTheBusiness() {
        assertThat(EmailTemplate.BOOKING_CONFIRMATION.subject(CUSTOMER))
                .isEqualTo("Votre rendez-vous chez Salon Fatou");
    }

    @Test
    @DisplayName("A notice to the provider leads with whose appointment it is")
    void addressesTheProvider() {
        assertThat(EmailTemplate.BOOKING_NOTICE.audience())
                .isEqualTo(EmailTemplate.Audience.PROVIDER);
        assertThat(EmailTemplate.BOOKING_NOTICE.details(CUSTOMER))
                .containsEntry("Client", "Mariama B.");
        // Their own business name would tell them nothing.
        assertThat(EmailTemplate.BOOKING_NOTICE.subject(CUSTOMER)).doesNotContain("Salon Fatou");
    }

    @Test
    @DisplayName("A detail the row does not carry is left out, not printed empty")
    void leavesOutWhatIsMissing() {
        // A cancellation is planned without a duration. "Durée :" followed by
        // nothing reads as a bug to the person it was sent to.
        Map<String, String> withoutDuration = Map.of(
                "business_name", "Salon Fatou",
                "customer_name", "Mariama B.",
                "service_name", "Tresses",
                "starts_at_local", "04/09/2026 10:00");

        assertThat(EmailTemplate.CANCELLATION.details(withoutDuration))
                .containsOnlyKeys("Service", "Date");
    }

    @Test
    @DisplayName("A key the payload lost takes nothing but itself")
    void survivesAMissingKey() {
        assertThat(EmailTemplate.BOOKING_CONFIRMATION.subject(Map.of()))
                .doesNotContain("{")
                .doesNotContain("business_name");
    }
}
