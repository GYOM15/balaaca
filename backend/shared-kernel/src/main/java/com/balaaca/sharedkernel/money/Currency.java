package com.balaaca.sharedkernel.money;

/**
 * A currency and the scale of its minor unit. The scale is carried here so that
 * no call site ever assumes "cents": GNF has no minor unit at all, so dividing
 * or multiplying by 100 is simply wrong for the launch market.
 */
public enum Currency {

    /** Guinean franc. No minor unit: 1 GNF is one minor unit. */
    GNF(0),
    /** West African CFA franc, for a likely second market. */
    XOF(0),
    EUR(2),
    USD(2);

    private final int scale;

    Currency(int scale) {
        this.scale = scale;
    }

    /** Minor units per major unit is {@code 10^scale}. */
    public int scale() {
        return scale;
    }

    /** Parses an ISO-4217 code off a contract or a stored column. */
    public static Currency of(String isoCode) {
        if (isoCode == null) {
            throw new UnknownCurrencyException("null");
        }
        try {
            return valueOf(isoCode.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new UnknownCurrencyException(isoCode);
        }
    }
}
