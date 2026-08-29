package com.balaaca.sharedkernel.money;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

public final class UnknownCurrencyException extends DomainException {

    public UnknownCurrencyException(String isoCode) {
        super("VALIDATION_FAILED", 422,
              "Unknown currency code", Map.of("iso_code", String.valueOf(isoCode)));
    }
}
