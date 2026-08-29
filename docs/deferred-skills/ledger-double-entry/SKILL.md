# ledger-double-entry

Every movement of money is recorded as a balanced, append-only, double-entry
`JournalEntry`. The `ledger` module owns the tables; no other module ever
writes them — everything goes through the Accounting API. A financial record
is never physically deleted; you correct it with a reversing entry and a
reason.

## When to use

- Booking a sale, a delivery fee, a refund, a payout, or any commission —
  anything that moves money between accounts.
- Deciding *where* a posting happens (it is always the `ledger` module,
  reached through its inbound Accounting API — never a direct table write).
- Adding or reviewing a new account or a new kind of journal entry.
- Reviewing a PR that touches `journal_entry` / `journal_line`, or that
  `UPDATE`s / `DELETE`s anything money-shaped.

## The rules

1. **The ledger is a bounded context; the Accounting API is its only door.**
   Postings go through `ledger`'s inbound port (`AccountingApi.post(...)` /
   `reverse(...)`), an in-process Java call. No other module maps, injects,
   or SQL-touches `journal_entry` / `journal_line`. Enforce it with ArchUnit
   *and* with a DB role that grants those tables only to `ledger`.
2. **Every entry is balanced per currency, checked at construction.** For
   each `Currency` present, `sum(debit) == sum(credit)`. An unbalanced entry
   is rejected with a domain exception before it can be persisted — there is
   no "save first, reconcile later". Never net a debit in one currency
   against a credit in another to make the totals appear to match.
3. **Direction is a column, never a sign.** A line carries a `Money debit`
   *or* a `Money credit` (exactly one non-zero), both typed `Money`
   (`amountMinor` + `Currency`, GNF scale 0). No `double`/`float`, no single
   signed `amount`, no "assumed cents". See `money-currency`.
4. **Append-only. Entries and lines are immutable once posted.** No `UPDATE`,
   no `DELETE`, no soft-delete flag flipping. A mistake or a refund is a *new*
   reversing entry that references the original and records a human-readable
   `reason`. This is a hard review gate — a financial record is never
   physically removed.
5. **Each entry has a UNIQUE business `reference`; posting is idempotent.**
   The `reference` (e.g. `sale:<order.externalReference>`) is `UNIQUE` in the
   schema. Re-posting the same reference returns the existing entry instead
   of double-booking — a duplicate webhook or a retried worker must not
   create a second sale. See `idempotency-concurrency`.
6. **The operational ledger and platform-billing are separate ledgers.**
   Customer→Restaurant money (sales, delivery, refunds) lives in the
   operational ledger. Restaurant→Platform money (subscription, commission)
   lives in `platform-billing`. Never post a platform commission line into an
   operational sale entry, or vice versa; they use distinct account trees.
7. **The sale is booked AT CAPTURE, not at order placement.** Placing an
   order writes no ledger entry. The revenue entry is written in the saga's
   second transaction, after the payment is verified with the gateway (see
   `payments-gateway`), with `occurredAt` = the capture instant, not the row
   insert time.
8. **Every entry and line carries `tenant_id`; RLS is on.** `tenant_id` comes
   from `TenantContext` (derived from the JWT, never a parameter), and
   PostgreSQL RLS scopes every read and write. Cross-tenant reporting is a
   privileged, audited platform-admin path only. See `multi-tenant-rls`.
9. **The balance invariant is property-based tested (jqwik).** Generate
   random line sets: balanced ones persist, unbalanced ones are rejected, a
   reversing entry always nets an original to zero. These invariant tests are
   part of Definition of Done. See `backend-tests`.
10. **Accounts are a typed, documented chart — not free-form strings.** Post
    to `Account` value objects / enum constants (`SALES_REVENUE`,
    `GATEWAY_CLEARING`, `DELIVERY_FEE_INCOME`, `REFUNDS`), each with a
    documented meaning. No scattered string literals as account codes.

## Anti-patterns

- `ordering`/`payments` calling `em.persist(journalLine)` or `INSERT INTO
  journal_entry ...` → rule 1; go through `AccountingApi`.
- `UPDATE journal_entry SET amount = ...` or `DELETE FROM journal_line` to fix
  a booking → rule 4; post a reversing entry with a `reason`.
- A line with `BigDecimal amount` that is negative for credits → rules 2–3;
  typed `Money` in explicit `debit` / `credit` columns.
- Balancing a `GNF` debit against a `USD` credit → rule 2; balance per
  currency, never across currencies.
- Writing the revenue entry when the order is placed → rule 7; book the sale
  at capture, after gateway verification.
- A webhook retry that creates a second `sale:` entry → rule 5; `reference`
  is `UNIQUE`, posting is idempotent.
- A platform commission line inside the operational sale entry → rule 6;
  commission belongs to `platform-billing`.
- `accounts.post("4001", ...)` with a bare code string → rule 10; use the
  typed `Account`.

## Minimal correct example

```java
// ledger/domain — append-only, framework-free, enforces the invariant.
public record JournalLine(Account account, Money debit, Money credit) {
    public JournalLine {
        // exactly one side carries value; both sides share one currency
        if (debit.isZero() == credit.isZero()) {
            throw new InvalidJournalLineException("a line is a debit XOR a credit");
        }
    }
    public static JournalLine debit(Account account, Money amount) {
        return new JournalLine(account, amount, Money.zero(amount.currency()));
    }
    public static JournalLine credit(Account account, Money amount) {
        return new JournalLine(account, Money.zero(amount.currency()), amount);
    }
}

public final class JournalEntry {
    private final JournalEntryId id;
    private final TenantId tenant;
    private final Instant occurredAt;      // business time = capture instant
    private final String reference;        // UNIQUE business key -> idempotent post
    private final String reason;           // required on reversing entries
    private final List<JournalLine> lines; // immutable after construction

    public static JournalEntry of(TenantId tenant, Instant occurredAt,
                                  String reference, List<JournalLine> lines) {
        requireBalancedPerCurrency(lines); // INVARIANT enforced before it can persist
        return new JournalEntry(tenant, occurredAt, reference, null, List.copyOf(lines));
    }

    /** Correction path: never delete, always reverse. */
    public JournalEntry reversal(String reference, String reason) {
        var swapped = lines.stream()
                .map(l -> new JournalLine(l.account(), l.credit(), l.debit()))
                .toList();
        return new JournalEntry(tenant, Instant.now(), reference, reason, swapped);
    }

    private static void requireBalancedPerCurrency(List<JournalLine> lines) {
        Map<Currency, Money> debits  = sumByCurrency(lines, JournalLine::debit);
        Map<Currency, Money> credits = sumByCurrency(lines, JournalLine::credit);
        if (!debits.equals(credits)) {
            throw new UnbalancedJournalEntryException(debits, credits);
        }
    }
}
```

```java
// payments/application — books the sale AT CAPTURE, only via the Accounting API.
// This is the caller; it never touches ledger tables directly.
JournalEntry sale = JournalEntry.of(
        tenant(),                                   // from TenantContext, not a param
        charge.capturedAt(),
        "sale:" + order.externalReference(),        // UNIQUE -> idempotent
        List.of(
            JournalLine.debit(Account.GATEWAY_CLEARING, charge.amount()),
            JournalLine.credit(Account.SALES_REVENUE,  charge.amount())
        ));
accounting.post(sale);   // ledger's inbound port, in-process; idempotent on reference
```

The domain rejects an unbalanced entry before persistence; the sale is booked
once, at capture; a refund later would be `accounting.reverse(...)`, never a
delete.

## Sibling skills

- `money-currency` — the typed `Money`/`Currency` every debit and credit uses.
- `payments-gateway` — verifies the charge, then triggers the sale posting at
  capture.
- `outbox-messaging` — the ledger write and the `OrderPaid` event commit in the
  saga's second transaction.
- `idempotency-concurrency` — the `UNIQUE reference` and idempotent posting that
  stop double-booking.
- `multi-tenant-rls` — `tenant_id` + RLS scoping every entry and line.
- `backend-architecture` — `ledger` as a core module; the Accounting API as its
  inbound port.
- `cdi-interceptors` — why ledger posting stays explicit in the application
  layer, never hidden in an interceptor.
- `backend-exceptions` — `UnbalancedJournalEntryException` surfaced as RFC 7807.
- `backend-tests` — the jqwik property tests that guard the balance invariant.
- `code-language` — English identifiers for accounts, entries, and reasons.
