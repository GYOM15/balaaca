package com.balaaca.sharedkernel.money;

import com.balaaca.sharedkernel.error.DomainException;
import java.util.Map;

public final class CurrencyMismatchException extends DomainException {

    public CurrencyMismatchException(Currency left, Currency right) {
        super("CURRENCY_MISMATCH", 422,
              "Cannot combine amounts in different currencies",
              Map.of("left", left.name(), "right", right.name()));
    }
}
