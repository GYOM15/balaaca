package com.balaaca.booking.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Where a booking came from, and what that decides.
 *
 * <p>Two questions live on this enum and they are the only thing that tells a
 * counter entry apart from a stranger's booking. Stated as tests because they
 * are product rules, not plumbing: getting either wrong is silent - the wrong
 * booking is accepted, or the right one refused, and no exception is raised
 * anywhere.
 */
class BookingSourceTest {

    @Nested
    @DisplayName("What the provider published")
    class Published {

        @Test
        @DisplayName("Binds the people it was published to")
        void bindsCustomers() {
            // The hours, the notice period and the horizon are a promise made
            // to strangers, and the chatbot answers strangers.
            assertThat(BookingSource.PUBLIC.honoursPublishedAvailability()).isTrue();
            assertThat(BookingSource.CHATBOT.honoursPublishedAvailability()).isTrue();
        }

        @Test
        @DisplayName("Does not bind the provider writing in their own diary")
        void doesNotBindTheProvider() {
            // Somebody is at the counter, the shop closes in ten minutes, and
            // the appointment is happening whatever the page says. A diary that
            // refuses to record it is a diary the salon keeps on paper.
            assertThat(BookingSource.DASHBOARD.honoursPublishedAvailability()).isFalse();
            assertThat(BookingSource.ADMIN.honoursPublishedAvailability()).isFalse();
        }
    }

    @Nested
    @DisplayName("Who agreed to it")
    class Acceptance {

        @Test
        @DisplayName("A request from outside still waits for the provider's policy")
        void aCustomerRequestWaits() {
            // auto_confirm answers "do I want to see each request first?", and
            // the request it is about is a stranger's.
            assertThat(BookingSource.PUBLIC.arrivesAccepted()).isFalse();
            assertThat(BookingSource.CHATBOT.arrivesAccepted()).isFalse();
        }

        @Test
        @DisplayName("Typing it in IS the acceptance")
        void aCounterEntryIsAlreadyAccepted() {
            // Left pending, the salon's own entry would sit in the salon's own
            // queue, waiting for itself.
            assertThat(BookingSource.DASHBOARD.arrivesAccepted()).isTrue();
            assertThat(BookingSource.ADMIN.arrivesAccepted()).isTrue();
        }
    }

    @Test
    @DisplayName("Every source answers both questions")
    void everySourceIsDecided() {
        // A source added without a thought here would answer one of them by
        // falling off the end of an || chain, which is the quiet half of the
        // decision: it would be bound by nothing, or accepted by nobody.
        for (BookingSource source : BookingSource.values()) {
            assertThat(source.honoursPublishedAvailability())
                    .as("%s must be a customer or a provider, not neither", source)
                    .isNotEqualTo(source.arrivesAccepted());
        }
    }
}
