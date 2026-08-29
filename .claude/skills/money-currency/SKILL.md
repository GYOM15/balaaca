---
name: money-currency
description: Use when introducing, computing with, persisting or wiring a monetary amount, freezing a ServiceOffering price onto an Appointment, adding or validating a PhoneNumber, or reviewing a PR that has a double/float/bare-long amount, a "x 100", a hardcoded GNF or +224, or a client-supplied price trusted as-is.
---

# money-currency

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Money is a typed value object — `Money(long amountMinor, Currency currency)` —
where the `Currency` carries its own scale. Never a `double`, never a `float`,
never a bare number, and never an assumption that the minor unit is "cents".
The service price is frozen server-side onto the appointment at booking time.
The same discipline applies to the other market-shaped value object,
`PhoneNumber`, which closes this skill.

## When to use

- Introducing any monetary amount: a `ServiceOffering` price, the amount a
  customer owes on an `Appointment`, a plan price displayed on a subscription
  page.
- Doing arithmetic on money (summing several services booked together,
  applying a discount).
- Persisting an amount or putting one on a REST/OpenAPI contract.
- Freezing a price onto an `Appointment` when a booking is created.
- Adding or validating a `PhoneNumber` — the primary customer identifier.
- Reviewing a PR that has a `double`/`float`/bare-`long` amount, a `× 100`,
  a hardcoded `GNF`, a hardcoded `+224`, or a client-supplied price trusted
  as-is.

## The rules

1. **Every monetary amount is a `Money(long amountMinor, Currency currency)`
   value object.** No `double`, no `float`, no `BigDecimal`-as-ambient-money,
   no naked `long price`. If it is money, its Java type is `Money`. The pair is
   inseparable — an amount without its currency is meaningless. `Money` lives
   in `com.balaaca.sharedkernel.money` and is framework-free.
2. **`amountMinor` is an integer count of the currency's *minor* unit, and the
   scale comes from the `Currency`, never from a hard-coded constant.** GNF has
   scale `0` (1 GNF = 1 minor unit — there are no centimes); another currency
   may have scale `2` or `3`. Never write `/ 100` or `* 100`, never assume
   "cents", never assume two decimals.
3. **GNF is never hardcoded, and a new market costs one enum constant.**
   Guinea is the launch market, not the product. The currency of an amount
   comes from the provider (its country/market configuration) or from the row
   it was read from — never from a literal `Currency.GNF` buried in a service,
   a mapper, a default parameter, or a migration `DEFAULT`. Fixtures and tests
   may name a currency explicitly; production code paths resolve it.
   Be honest about the cost of a second market: it adds a constant and its
   scale to the `Currency` enum, and nothing else — which currency a given
   provider prices in stays configuration, and no service, mapper, contract or
   migration changes. "Configuration only" would be a lie; "one enum constant
   and then configuration" is the truth, and it is only true because rules 1-2
   keep the scale out of the call sites.
4. **No floating-point value ever touches money — parse, compute, persist, or
   wire.** A price read from a contract is parsed into `amountMinor` as an
   integer. `0.1 + 0.2 != 0.3`; a rounding drift of one minor unit on a stored
   price is a defect, not a rounding "quirk".
5. **Arithmetic is currency-checked.** `add`/`subtract` require the operands to
   share the same `Currency` or throw `CurrencyMismatchException`; you never
   silently coerce. You **multiply `Money` by a scalar quantity** — you never
   multiply two `Money` together (money² is nonsense).
6. **Splitting is an explicit `allocate` that loses nothing.** A proportional
   discount or any future division goes through `allocate` on `Money`, with a
   defined remainder policy so `sum(parts) == whole` exactly — the leftover
   minor units are handed to the leading shares, deterministically, never
   dropped and never duplicated. `allocate` is a real method on `Money`, not a
   helper somewhere: division is where money silently leaks, so it has exactly
   one implementation and a property test standing on it.
7. **The service price is frozen onto the `Appointment` at booking time, in a
   column named for exactly what it means.** The client never sends a price; it
   sends a `service_offering_id` and a start instant. The domain reads the
   current server-side `ServiceOffering` price and snapshots it, together with
   the service name, onto the appointment row. A later catalogue price change
   never mutates a past booking — the frozen amount is the record.
   The columns are `customer_price_amount_minor` / `customer_price_currency`,
   read back through the accessor `customerPrice()`: they mean **what the
   customer owes for this appointment**, not "the total", not "the amount", not
   "the price". Naming them for their meaning is what lets a platform fee or a
   provider payout be added later as **additional** columns without making a
   single historical row ambiguous. A column called `amount_minor` would
   silently change meaning the day a fee exists.
8. **Persist money as a two-column pair `(…_amount_minor bigint NOT NULL,
   …_currency varchar(3) NOT NULL CHECK (… ~ '^[A-Z]{3}$'))`**, never a single
   `numeric`/`float` column pretending to be money. Use `varchar(3)`, never
   `char(3)`: `bpchar` blank-pads on write and strips on comparison, which
   turns an exact-match currency code into a type whose equality semantics
   differ from every other string column in the schema. `amountMinor` is a
   `bigint`. Both columns are always written and read together; a `NULL`
   currency beside a non-null amount is a broken row.
9. **Tax is not modelled, but nothing may preclude it.** The launch market
   charges no VAT on these services, so there is **no tax line and no tax rate
   today** — do not build a tax engine nobody uses. The one decision that is
   expensive to retrofit is **the semantics of a listed price**, because it
   changes what every stored amount MEANS. It is therefore recorded here
   explicitly: **a `ServiceOffering` price is what the customer pays, with no
   tax component.** A market with VAT requires an explicit per-provider
   decision, never an assumption inherited from Guinea. Everything else — a
   `taxLines[]`, a tax-inclusive flag — can be added additively precisely
   because rule 7 named the frozen columns for their meaning.
10. **Money invariants are covered by jqwik property tests, and the
    amount/currency pair by a persistence round-trip test.** Commutativity and
    associativity of `add` over operands **sharing a currency**, `add`/
    `subtract` as inverses, `allocate` summing back to the whole, and
    currency-mixing always throwing — proven over generated amounts, not a
    handful of examples. Separately, a Testcontainers PostgreSQL test writes a
    `Money` to an appointment row and reads it back identical, for a scale-0
    and a scale-2 currency, so the column pair and its mapping are locked.

## Anti-patterns

- `double price` / `float total` / a bare `long amount` on a field, DTO, or
  method → rule 1; money is always typed and carries its currency.
- `amountMinor / 100` or `amount * 100` to "get the value" → rule 2; read
  `currency.scale()`. GNF is scale `0`, so `/ 100` is simply wrong here.
- `Money.ofMinor(price, Currency.GNF)` in an application service, or
  `currency varchar(3) NOT NULL DEFAULT 'GNF'` in a migration → rule 3;
  resolve the currency from the provider, never from a literal.
- Claiming in a doc or an ADR that a new market is "configuration only" → rule
  3; it is one `Currency` constant plus its scale, then configuration. Say so.
- `Currency.valueOf(code)` on a value read off a contract or a row → rule 3;
  `Currency.of(code)`, which throws `UnknownCurrencyException`, not a raw
  `IllegalArgumentException` that no `ExceptionMapper` recognises.
- `BigDecimal` arithmetic with an implicit scale and `RoundingMode` sprinkled at
  call sites → rule 4; integer minor units in `Money`, rounding only inside
  `allocate`.
- `servicePrice.add(otherProviderPrice)` where the two are different
  currencies, silently coerced → rule 5; throw `CurrencyMismatchException`.
- `unitPrice.multiply(otherPrice)` → rule 5; multiply `Money` by an
  `int`/`long` quantity only.
- `total.amountMinor() / parts` at a call site → rule 6; `total.allocate(parts)`
  so the remainder is placed, not lost.
- Trusting a `price` field sent by the client on the booking request → rule 7;
  ignore it and freeze the server price onto the appointment.
- An appointment column called `amount_minor` or `total_amount_minor` → rule 7;
  name it `customer_price_amount_minor` so a future fee column cannot make it
  ambiguous.
- `price numeric(12,2)` single column, or `price_currency char(3)` → rule 8;
  `(price_amount_minor bigint, price_currency varchar(3) CHECK (… ~
  '^[A-Z]{3}$'))`.
- `PhoneNumber.toString()` (or any accessor) returning a masked value → see the
  `PhoneNumber` section; masking belongs at the log boundary, and a masked
  number that reaches a `notifications` row makes every reminder undeliverable.

## Minimal correct example

The value object and its currency-checked arithmetic
(`com.balaaca.sharedkernel.money`):

```java
public enum Currency {
    GNF(0),   // Guinean franc - no minor unit, scale 0
    XOF(0),
    EUR(2),
    USD(2);

    private static final Map<String, Currency> BY_CODE = Arrays.stream(values())
            .collect(toUnmodifiableMap(Enum::name, identity()));

    private final int scale;
    Currency(int scale) { this.scale = scale; }

    public int scale() { return scale; }   // minor units per unit == 10^scale
    public String code() { return name(); }

    /**
     * Parse an ISO-4217 code off a contract or a database row. Unknown codes
     * are a domain failure, not a programming error: UnknownCurrencyException
     * extends DomainException and maps to a published error code.
     */
    public static Currency of(String isoCode) {
        Currency currency = BY_CODE.get(isoCode);
        if (currency == null) {
            throw new UnknownCurrencyException(isoCode);
        }
        return currency;
    }
}

public record Money(long amountMinor, Currency currency) {

    /**
     * Canonical factory. Always construct money through it, never through the
     * record constructor directly, so every call site reads as minor units.
     */
    public static Money ofMinor(long amountMinor, Currency currency) {
        return new Money(amountMinor, currency);
    }

    public static Money zero(Currency c) { return Money.ofMinor(0, c); }

    public Money add(Money other) {
        requireSameCurrency(other);
        return Money.ofMinor(Math.addExact(amountMinor, other.amountMinor), currency);
    }

    public Money subtract(Money other) {
        requireSameCurrency(other);
        return Money.ofMinor(Math.subtractExact(amountMinor, other.amountMinor), currency);
    }

    /** Money x quantity - never Money x Money. */
    public Money times(long quantity) {
        return Money.ofMinor(Math.multiplyExact(amountMinor, quantity), currency);
    }

    /**
     * Splits into `parts` shares that sum back to this amount exactly. The
     * remainder is distributed one minor unit at a time to the leading shares,
     * so the split is deterministic and nothing is dropped or duplicated.
     */
    public List<Money> allocate(int parts) {
        if (parts < 1) {
            throw new IllegalArgumentException("parts must be >= 1");
        }
        long base = amountMinor / parts;                 // truncates toward zero
        long remainder = amountMinor - base * parts;     // sign follows the amount
        long step = Long.signum(remainder);
        long spread = Math.abs(remainder);

        List<Money> shares = new ArrayList<>(parts);
        for (int i = 0; i < parts; i++) {
            shares.add(Money.ofMinor(base + (i < spread ? step : 0), currency));
        }
        return List.copyOf(shares);
    }

    private void requireSameCurrency(Money other) {
        if (currency != other.currency) {
            throw new CurrencyMismatchException(currency, other.currency);
        }
    }
}
```

Freeze the server price onto the appointment at booking time. The client sends
no price, no currency, and no end time — the slot and the amount are both
recomputed server-side:

```java
ServiceOffering offering = catalog.requireVisible(command.serviceOfferingId());

Appointment appointment = Appointment.book(
    resolvedStaffId,                  // "any available staff" resolved first
    customer.id(),
    offering.id(),
    offering.name(),                  // snapshot: name at booking time
    offering.price(),                 // snapshot: Money, currency from the provider
    command.startsAt(),               // instant only; duration comes from the offering
    offering.duration(),
    offering.buffers(),
    clock);
```

Persist as an amount/currency pair, named for what the amount means. The one
normative `appointments` DDL — block columns, `CHECK` constraints, the
`EXCLUDE USING gist` constraint — lives in `booking-integrity` as
`V014__create_appointments.sql`; this is an **excerpt** showing only the
frozen-price columns and the composite foreign key that keeps the offering and
its snapshot in the same tenant:

```sql
-- EXCERPT of V014__create_appointments.sql (normative copy: booking-integrity)
CREATE TABLE appointments (
    id                          uuid        PRIMARY KEY,
    provider_id                 uuid        NOT NULL,
    staff_id                    uuid        NOT NULL,
    customer_id                 uuid        NOT NULL,
    service_offering_id         uuid        NOT NULL,
    service_name                text        NOT NULL,   -- frozen at booking
    customer_price_amount_minor bigint      NOT NULL,   -- frozen: what the
    customer_price_currency     varchar(3)  NOT NULL,   -- customer owes
    starts_at                   timestamptz NOT NULL,
    ends_at                     timestamptz NOT NULL,
    -- ... block columns, CHECK and EXCLUDE constraints: see booking-integrity
    CONSTRAINT ck_appointments_currency
        CHECK (customer_price_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT fk_appointments_service_offering
        FOREIGN KEY (provider_id, service_offering_id)
        REFERENCES service_offerings (provider_id, id)
);
```

That foreign key only compiles because the referenced table declares the
matching key; without it PostgreSQL raises `42830`:

```sql
-- in V0xx__create_service_offerings.sql
ALTER TABLE service_offerings ADD CONSTRAINT service_offerings_tenant_key
    UNIQUE (provider_id, id);
```

jqwik proves the algebra rather than a few examples. Note that the
commutativity property generates **one** currency and two amounts — generating
two independent `Money` values would make the property vacuous, since mixed
currencies throw before commutativity is ever exercised:

```java
@Property
void addIsCommutative(
        @ForAll Currency currency,
        @ForAll @LongRange(min = -1_000_000_000L, max = 1_000_000_000L) long left,
        @ForAll @LongRange(min = -1_000_000_000L, max = 1_000_000_000L) long right) {

    Money a = Money.ofMinor(left, currency);
    Money b = Money.ofMinor(right, currency);

    assertThat(a.add(b)).isEqualTo(b.add(a));
}

@Property
void allocateSumsBackToWhole(
        @ForAll Currency currency,
        @ForAll @LongRange(min = 0, max = 1_000_000_000L) long amountMinor,
        @ForAll @IntRange(min = 1, max = 12) int parts) {

    Money total = Money.ofMinor(amountMinor, currency);
    List<Money> shares = total.allocate(parts);

    assertThat(shares).hasSize(parts);
    assertThat(shares.stream().reduce(Money.zero(currency), Money::add))
        .isEqualTo(total);
}

@Property
void mixingCurrenciesThrows(@ForAll("scale0") Money a, @ForAll("scale2") Money b) {
    assertThatThrownBy(() -> a.add(b)).isInstanceOf(CurrencyMismatchException.class);
}
```

The column pair is locked by a real-PostgreSQL round trip, at both scales:

```java
@QuarkusTest
class AppointmentPriceRoundTripTest {   // Testcontainers PostgreSQL 18

    @ParameterizedTest
    @EnumSource(value = Currency.class, names = {"GNF", "EUR"})
    void frozenPriceSurvivesPersistence(Currency currency) {
        Money price = Money.ofMinor(5_000, currency);   // GNF: 5000, not 500000
        AppointmentId id = appointments
                .insertIfAbsent(anAppointmentPricedAt(price)).id();

        assertThat(appointments.findById(id).orElseThrow().customerPrice())
            .isEqualTo(price);
    }
}
```

## Companion value object: PhoneNumber

The phone number is the **primary customer identifier**; email is optional and
nullable. It is a typed value object in `shared-kernel`, alongside `Money` and
under the same market-neutrality rule — not a `String` passed around.

1. **Stored and compared in E.164** — `+224622000000`, digits only after the
   `+`, no spaces, no local `0` prefix, one canonical form per subscriber. The
   raw input the customer typed is never what gets stored or matched.
2. **Validation is general E.164 with a default region derived from the
   provider's country** — never a hardcoded `+224`, and never a Guinea-shaped
   regex. A national-format input is parsed against the provider's region; an
   input already in international format is accepted whatever its country.
   This is the phone-number equivalent of rule 3: the launch market supplies a
   default, not a constraint.
3. **`PhoneNumber` never masks itself.** No `toString()` override returning a
   masked form, no `masked()` accessor used as the default, no masking in a
   Jackson serializer. A masked `toString()` looks like defence in depth and is
   in fact silent corruption: every string concatenation, every
   `String.valueOf`, every template interpolation, and above all the
   `notifications` row that carries the recipient would receive `+*******23`
   instead of a number, and every reminder would fail delivery with an
   unroutable address — a failure that shows up days later, in the channel
   gateway, far from the cause. `toString()` returns the E.164 value.
4. **Masking happens at the log boundary, once** (see `pii-masking-logging`).
   A phone number is PII; it reaches a log only through
   `LogMasking.maskPhone`, applied by the logging/audit interceptor, never by
   the value object and never by business code.

```java
public record PhoneNumber(String e164) {

    /**
     * Parse a customer-entered number. `defaultRegion` is the provider's
     * ISO-3166 country, so a national-format input resolves correctly in any
     * market; an international-format input is region-independent.
     */
    public static PhoneNumber parse(String rawInput, String defaultRegion) { ... }

    // No toString() override. The canonical E.164 value is what callers get,
    // including the notification send path; masking is applied at the log
    // boundary by LogMasking.maskPhone, never here.
}
```

```sql
-- customers are tenant-scoped; the phone is unique per provider, not global,
-- because two providers keep their own address books. The (provider_id, id)
-- key exists because appointments references customers with a composite FK.
CREATE TABLE customers (
    id           uuid PRIMARY KEY,
    provider_id  uuid NOT NULL,
    phone_e164   text NOT NULL,
    email        text NULL,
    CONSTRAINT customers_phone_unique  UNIQUE (provider_id, phone_e164),
    CONSTRAINT customers_tenant_key    UNIQUE (provider_id, id)
);
```

## Sibling skills

- `booking-integrity` — owns the normative `appointments` DDL; the frozen price
  is snapshotted on the same insert the exclusion constraint guards, and the
  slot is recomputed server-side too.
- `idempotency-concurrency` — the frozen price lives on the aggregate created
  under the `Idempotency-Key` contract, so a replay never re-freezes.
- `contract-first` — how a `Money` is shaped on a REST/OpenAPI schema (an
  integer `amount_minor` plus a currency code, never a float).
- `backend-tests` — jqwik property tests on money invariants and the
  Testcontainers round-trip test that locks the column pair.
- `multi-tenant-rls` — priced tables carry `provider_id` and RLS like every
  tenant-scoped table; composite foreign keys keep the offering and its frozen
  price in the same tenant.
- `pii-masking-logging` — `PhoneNumber` never reaches a log unmasked, and never
  masks itself to get there.
- `backend-exceptions` — `CurrencyMismatchException` and
  `UnknownCurrencyException` extend the single `DomainException` base, never a
  generic `IllegalStateException`.
- `backend-naming` — `ServiceOffering` / `service_offerings` /
  `service_offering_id` is one term in three spellings, fixed everywhere.
