package com.balaaca.sharedkernel.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import net.jqwik.api.Arbitraries;
import net.jqwik.api.Arbitrary;
import net.jqwik.api.Combinators;
import net.jqwik.api.ForAll;
import net.jqwik.api.Property;
import net.jqwik.api.Provide;
import net.jqwik.api.constraints.IntRange;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MoneyTest {

    @Test
    @DisplayName("GNF has no minor unit, so a price is its own minor amount")
    void gnfHasScaleZero() {
        assertThat(Currency.GNF.scale()).isZero();
        assertThat(Money.ofMinor(150_000, Currency.GNF).amountMinor()).isEqualTo(150_000);
    }

    @Test
    @DisplayName("Rejects combining two currencies rather than coercing one")
    void mixingCurrenciesThrows() {
        Money gnf = Money.ofMinor(1_000, Currency.GNF);
        Money eur = Money.ofMinor(1_000, Currency.EUR);

        assertThatThrownBy(() -> gnf.add(eur))
                .isInstanceOf(CurrencyMismatchException.class)
                .extracting(e -> ((CurrencyMismatchException) e).code())
                .isEqualTo("CURRENCY_MISMATCH");
    }

    @Test
    @DisplayName("Overflow is an error, never a wrap-around")
    void overflowThrows() {
        Money huge = Money.ofMinor(Long.MAX_VALUE, Currency.GNF);

        assertThatThrownBy(() -> huge.add(Money.ofMinor(1, Currency.GNF)))
                .isInstanceOf(ArithmeticException.class);
    }

    @Test
    @DisplayName("An unknown ISO code is a typed domain failure, not IllegalArgument")
    void unknownCurrencyIsTyped() {
        assertThatThrownBy(() -> Currency.of("XYZ"))
                .isInstanceOf(UnknownCurrencyException.class);
    }

    @Property
    void addIsCommutative(@ForAll("gnfPair") List<Money> pair) {
        assertThat(pair.get(0).add(pair.get(1)))
                .isEqualTo(pair.get(1).add(pair.get(0)));
    }

    @Property
    void subtractUndoesAdd(@ForAll("gnfPair") List<Money> pair) {
        Money a = pair.get(0);
        Money b = pair.get(1);
        assertThat(a.add(b).subtract(b)).isEqualTo(a);
    }

    @Property
    void allocateLosesNothing(@ForAll("gnf") Money total,
                              @ForAll @IntRange(min = 1, max = 12) int parts) {
        List<Money> shares = total.allocate(parts);

        assertThat(shares).hasSize(parts);
        assertThat(shares.stream().reduce(Money.zero(Currency.GNF), Money::add))
                .isEqualTo(total);
    }

    @Property
    void allocateSharesDifferByAtMostOneMinorUnit(@ForAll("gnf") Money total,
                                                  @ForAll @IntRange(min = 1, max = 12) int parts) {
        List<Money> shares = total.allocate(parts);
        long min = shares.stream().mapToLong(Money::amountMinor).min().orElseThrow();
        long max = shares.stream().mapToLong(Money::amountMinor).max().orElseThrow();

        assertThat(max - min).isLessThanOrEqualTo(1);
    }

    @Provide
    Arbitrary<Money> gnf() {
        // Bounded well inside long so that add/times in a property cannot
        // overflow for a reason unrelated to what is being asserted.
        return Arbitraries.longs().between(-1_000_000_000L, 1_000_000_000L)
                .map(v -> Money.ofMinor(v, Currency.GNF));
    }

    @Provide
    Arbitrary<List<Money>> gnfPair() {
        return Combinators.combine(gnf(), gnf()).as(List::of);
    }
}
