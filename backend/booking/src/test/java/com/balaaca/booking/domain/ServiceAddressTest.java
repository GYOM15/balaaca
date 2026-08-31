package com.balaaca.booking.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Where the provider is going.
 *
 * <p>One required field out of three, and the choice is the whole design: the
 * commune comes from a closed map and the quartier is free text, but neither of
 * them is what gets a plumber to the door. "Derriere la mosquee de Nongo,
 * portail bleu" does, so that is the one that cannot be blank.
 */
class ServiceAddressTest {

    @Nested
    @DisplayName("Directions")
    class Directions {

        @Test
        @DisplayName("An address with no directions is not an address")
        void blankIsRefused() {
            // Refused at construction rather than stored and discovered on the
            // day of the appointment, when the tradesman is in the car.
            for (String nothing : new String[] {null, "", "   ", "\n\t "}) {
                assertThatThrownBy(() -> new ServiceAddress(
                        Optional.empty(), Optional.empty(), nothing))
                        .isInstanceOf(IllegalArgumentException.class)
                        .hasMessageContaining("directions");
            }
        }

        @Test
        @DisplayName("What a customer typed is trimmed, not stored as typed")
        void surroundingSpaceIsDropped() {
            var address = new ServiceAddress(Optional.empty(), Optional.empty(),
                                             "  portail bleu  ");

            assertThat(address.directions()).isEqualTo("portail bleu");
        }

        @Test
        @DisplayName("A Plus Code is words, and stays words")
        void aPlusCodeIsNotParsed() {
            // Exactly the useful thing to paste in a city with few street
            // addresses - and it is kept as written, never turned into a
            // geometry. There is no map, no routing and no dispatch to read it.
            var address = new ServiceAddress(Optional.empty(), Optional.empty(),
                                             "7CJ5MJ8P+3F, portail bleu");

            assertThat(address.directions()).isEqualTo("7CJ5MJ8P+3F, portail bleu");
        }
    }

    @Nested
    @DisplayName("The rest of it")
    class TheRest {

        @Test
        @DisplayName("A quartier alone is a complete address")
        void theCommuneIsOptional() {
            // "Nongo, behind the mosque" tells the plumber everything he needs.
            // Refusing it because the customer did not also pick a commune from
            // a dropdown would lose the booking.
            var address = new ServiceAddress(Optional.empty(), Optional.of("Nongo"),
                                             "derriere la mosquee");

            assertThat(address.localitySlug()).isEmpty();
            assertThat(address.area()).contains("Nongo");
        }

        @Test
        @DisplayName("Both halves of the map are carried when they are given")
        void theCommuneIsKeptWhenGiven() {
            var address = new ServiceAddress(Optional.of("ratoma"), Optional.of("Nongo"),
                                             "portail bleu");

            assertThat(address.localitySlug()).contains("ratoma");
            assertThat(address.area()).contains("Nongo");
        }
    }
}
