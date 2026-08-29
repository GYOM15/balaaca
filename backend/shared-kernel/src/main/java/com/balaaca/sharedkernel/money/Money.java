package com.balaaca.sharedkernel.money;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * A monetary amount as an integer count of its currency's minor unit. Never a
 * double, never a bare long: an amount without its currency is meaningless, and
 * binary floating point loses minor units on amounts a customer will read.
 *
 * <p>Arithmetic is currency-checked and overflow-checked. You multiply money by
 * a quantity; multiplying two amounts together is nonsense and has no method.
 */
public record Money(long amountMinor, Currency currency) implements Comparable<Money> {

    public Money {
        Objects.requireNonNull(currency, "currency");
    }

    /** Canonical factory. Every call site reads as minor units. */
    public static Money ofMinor(long amountMinor, Currency currency) {
        return new Money(amountMinor, currency);
    }

    public static Money zero(Currency currency) {
        return new Money(0L, currency);
    }

    public Money add(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(amountMinor, other.amountMinor), currency);
    }

    public Money subtract(Money other) {
        requireSameCurrency(other);
        return new Money(Math.subtractExact(amountMinor, other.amountMinor), currency);
    }

    /** Money times a quantity. There is deliberately no money-times-money. */
    public Money times(long quantity) {
        return new Money(Math.multiplyExact(amountMinor, quantity), currency);
    }

    public boolean isNegative() {
        return amountMinor < 0;
    }

    public boolean isZero() {
        return amountMinor == 0;
    }

    /**
     * Splits into {@code parts} shares that sum back to this amount exactly.
     * The remainder is handed out one minor unit at a time to the earliest
     * shares, so nothing is ever dropped or invented - the property a future
     * commission split depends on.
     */
    public List<Money> allocate(int parts) {
        if (parts <= 0) {
            throw new IllegalArgumentException("parts must be positive, was " + parts);
        }
        long base = amountMinor / parts;
        long remainder = amountMinor - base * parts;
        long step = Long.signum(remainder);

        List<Money> shares = new ArrayList<>(parts);
        for (int i = 0; i < parts; i++) {
            long share = base;
            if (remainder != 0) {
                share += step;
                remainder -= step;
            }
            shares.add(new Money(share, currency));
        }
        return List.copyOf(shares);
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return Long.compare(amountMinor, other.amountMinor);
    }

    private void requireSameCurrency(Money other) {
        if (currency != other.currency) {
            throw new CurrencyMismatchException(currency, other.currency);
        }
    }
}
