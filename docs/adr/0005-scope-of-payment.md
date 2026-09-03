# ADR-0005 - No payment built now, the seams prepared

Status: Accepted

## Context

Two payment needs are anticipated, neither of them immediate:

- **A. Subscription**: after a free period, a provider pays the platform. The
  plans (`FREE`, `PRO`, `BUSINESS`) carry quotas that gate the product.
- **B. Paying for service offerings, with escrow**: a customer would pay for the
  service on the platform, which would freeze the funds until both parties
  confirm the service. Explicitly distant.

The first proposal was to extract the subscription into a separate service
talking over gRPC, and to keep payment for service offerings in the core.

## Decision

**Nothing is built now.** No payment module, no ledger, no PSP adapter, no
`.proto`.

Two distinctions carry the decision.

**Entitlements are not collection.** The word "subscription" hides two unrelated
systems: the **entitlements** ("this provider is on FREE, so at most 5 service
offerings"), which are a product rule read on almost every write in the core; and
**collection** (charging, invoicing, dunning, handling webhooks), which is
low-frequency and external-I/O bound.

**Entitlements stay in-process** in the monolith's `billing` context. Moving them
out would turn every `POST /services` into a synchronous network call: an outage
of the least critical module would block the creation of service offerings, or
open the quotas. The usual workaround, caching the plan in the core, comes to
exactly keeping it in the core, plus the synchronisation machinery.

**Collection** may become a separate deployable. But then the natural seam is an
**event** ("the payment succeeded" -> activate the plan), not a synchronous call:
once entitlements stay in the core, no synchronous core to billing call is left.
gRPC would cost the `.proto` chain, the stubs, mTLS and versioning discipline to
buy streaming and low latency that have no use here.

**The platform must never hold the funds.** Freezing a third party's money makes
Balaaca a payment intermediary: a BCRG licence, KYC/AML obligations, segregated
client accounts. The realistic path is a PSP that handles deferred capture or
split payment itself, with the platform orchestrating without being the
custodian. If the funds are never held, no ledger of customer balances is needed,
which removes the main argument for a separate service.

## What is done right now

Only what costs nothing today and a lot later:

1. `Money(amountMinor, Currency)` typed everywhere; the currency carries its
   scale; GNF is never hardcoded.
2. The price frozen on the appointment is named for **what it means** (what the
   customer owes), so that a commission or a payout can be added later without
   making historic rows ambiguous.
3. The appointment state machine is already atomic and conditional in the
   database, because payment will one day gate those transitions.
4. Nothing financial is ever hard-deleted.
5. `Idempotency-Key` is already required at booking: it is the same machinery.
6. An ADR records what a displayed price means today: what the customer pays,
   with no tax component and no visible commission.

## Consequences

Positive: no phantom architecture. The topology decision is deferred to the
moment the facts are known.

Negative: the feasibility of escrow depends on unverified PSP capabilities, in
particular whether a Guinean mobile money rail allows an authorisation without an
immediate debit. That investigation is deliberately deferred to implementation
time.

## Revisit when

The subscription actually has to be collected, or payment for service offerings
enters the plan. The investigation of the payment rails happens then, not before.
