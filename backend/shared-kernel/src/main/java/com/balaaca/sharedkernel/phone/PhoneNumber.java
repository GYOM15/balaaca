package com.balaaca.sharedkernel.phone;

import com.balaaca.sharedkernel.error.DomainException;
import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.PhoneNumberUtil.PhoneNumberFormat;
import java.util.Map;
import java.util.Objects;

/**
 * A phone number stored in E.164. The phone is the primary way a customer is
 * identified - email is optional - so parsing has to be correct rather than
 * approximate.
 *
 * <p>The default region is supplied by the caller, from the provider's country.
 * Nothing here assumes Guinea: hardcoding +224 would have to be undone by the
 * first provider in another market.
 */
public record PhoneNumber(String e164) {

    private static final PhoneNumberUtil UTIL = PhoneNumberUtil.getInstance();

    public PhoneNumber {
        Objects.requireNonNull(e164, "e164");
    }

    /**
     * @param defaultRegion ISO-3166 alpha-2 of the provider's country, used only
     *                      when the input carries no international prefix
     */
    public static PhoneNumber parse(String raw, String defaultRegion) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidPhoneNumberException("blank");
        }
        try {
            var parsed = UTIL.parse(raw, defaultRegion);
            if (!UTIL.isValidNumber(parsed)) {
                throw new InvalidPhoneNumberException(raw);
            }
            return new PhoneNumber(UTIL.format(parsed, PhoneNumberFormat.E164));
        } catch (NumberParseException e) {
            throw new InvalidPhoneNumberException(raw);
        }
    }

    /**
     * The dialable value. There is deliberately no masking override on
     * toString: a masked number written to a notification row would make every
     * reminder fail silently. Masking belongs at the log boundary.
     */
    @Override
    public String toString() {
        return e164;
    }

    public static final class InvalidPhoneNumberException extends DomainException {
        public InvalidPhoneNumberException(String raw) {
            // The raw value is a personal identifier: it belongs in details for
            // the audit trail, never in a message that reaches a client.
            super("VALIDATION_FAILED", 400, "Not a valid phone number",
                  Map.of("length", raw == null ? 0 : raw.length()));
        }
    }
}
