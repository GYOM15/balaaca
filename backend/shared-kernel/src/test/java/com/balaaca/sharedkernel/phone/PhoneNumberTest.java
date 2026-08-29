package com.balaaca.sharedkernel.phone;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class PhoneNumberTest {

    @ParameterizedTest
    @CsvSource({
        // A Guinean number, written the four ways a customer actually types it.
        "'622 00 00 01', GN, +224622000001",
        "'+224 622 00 00 01', GN, +224622000001",
        "'00224622000001', GN, +224622000001",
        "'622000001', GN, +224622000001",
    })
    @DisplayName("Normalises local input to E.164 using the provider's region")
    void normalisesToE164(String raw, String region, String expected) {
        assertThat(PhoneNumber.parse(raw, region).e164()).isEqualTo(expected);
    }

    @Test
    @DisplayName("An international number parses whatever the default region is")
    void internationalIgnoresDefaultRegion() {
        assertThat(PhoneNumber.parse("+221771234567", "GN").e164()).isEqualTo("+221771234567");
    }

    @Test
    @DisplayName("Serves a second market without a code change")
    void handlesAnotherRegion() {
        assertThat(PhoneNumber.parse("77 123 45 67", "SN").e164()).isEqualTo("+221771234567");
    }

    @ParameterizedTest
    @CsvSource({"'', GN", "'   ', GN", "'12', GN", "'not a number', GN", "'99999999999999', GN"})
    @DisplayName("Rejects what is not a dialable number")
    void rejectsInvalid(String raw, String region) {
        assertThatThrownBy(() -> PhoneNumber.parse(raw, region))
                .isInstanceOf(PhoneNumber.InvalidPhoneNumberException.class);
    }

    @Test
    @DisplayName("toString stays dialable: a masked value would break every reminder")
    void toStringIsNotMasked() {
        PhoneNumber phone = PhoneNumber.parse("+224622000001", "GN");

        assertThat(phone.toString()).isEqualTo("+224622000001").doesNotContain("*");
    }
}
