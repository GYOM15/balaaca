# payments-gateway

The `payments` domain depends on a `PaymentGatewayPort`; Flutterwave is the
first outbound adapter behind it and is never imported by the domain. The port
is provider-agnostic by construction: a second gateway (Stripe, Adyen, another
PSP) is added as another adapter, with zero change to the domain. Money is
collected through a saga by outbox - never a distributed ACID transaction - and every "success" is re-verified against the gateway's own API before a
sale is captured.

## When to use

- Initiating a charge, handling a payment webhook, or capturing/reconciling a
  payment.
- Adding or changing anything that talks to Flutterwave (or any future
  gateway).
- Modelling the `PaymentIntent` → `PaymentAttempt` → `PaymentTransaction`
  lifecycle, or a state transition on it.
- Reviewing a PR that imports a gateway SDK, trusts a webhook body, or wraps a
  gateway call in `@Transactional`.

## The rules

1. **The domain depends on `PaymentGatewayPort`, never on Flutterwave.** The
   port lives in `payments/ports/outbound`; the Flutterwave SDK / REST-client
   types exist ONLY in `payments/adapters/outbound/gateway`. Zero
   `com.flutterwave..` imports in `domain/` or `application/`. ArchUnit
   forbids the gateway package outside that adapter. See `backend-architecture`.
2. **Model the lifecycle as three aggregates, never one mutable row.**
   `PaymentIntent` (one per order intent, `idempotency_key UNIQUE`, `version`
   for optimistic locking) → `PaymentAttempt` (each try = one
   `attempt_reference` we generate, status `failed`/`pending`/`succeeded`, a
   guarded state machine) → `PaymentTransaction` (created only after API
   verification, holds the `provider_reference` returned by the gateway,
   immutable). Never collapse them into a single `Payment` you flip in place.
   **Both reference fields are provider-neutral names** - a gateway's own
   wording (Flutterwave `tx_ref`/`flw_ref`, Stripe `payment_intent`, …) is
   mapped inside its adapter and never leaks into the domain or a column
   name.
3. **Never trust the webhook body.** The webhook endpoint verifies the
   signature with the mechanism of the gateway that sent it (each adapter
   owns its own scheme), is idempotent, and its only job is to trigger a
   server-side re-verification via that gateway's verify API, keyed by our
   `attempt_reference`. The verified API response - not the webhook payload - decides success, amount, and currency. Signature mismatch → reject
   (RFC 7807).
4. **Verify amount + currency + reference against what we initiated.** A
   charge the gateway calls "successful" whose amount, currency, or
   `attempt_reference` does not match the `PaymentIntent` is rejected, never
   captured. The GNF representation at the gateway is pinned by integration
   tests before prod
   (never assume "cents"). See `money-currency`.
5. **The flow is a saga by outbox - never a distributed ACID transaction.**
   `[TX#1]` Order + `PaymentIntent` + `Outbox(InitiatePayment)` commit → a
   worker calls Flutterwave *outside any DB transaction* → customer confirms
   → webhook → API verification (idempotent) → `[TX#2]` `PaymentAttempt`
   succeeded + `PaymentTransaction` + ledger sale + Order → PAID +
   `Outbox(OrderPaid)` commit. Presenting Flutterwave inside a distributed
   ACID transaction is forbidden. See `outbox-messaging`.
6. **Idempotency AND concurrency, both.** `idempotency_key` is `UNIQUE` on the
   intent (a duplicate initiate returns the existing intent);
   `attempt_reference` / `provider_reference` dedupe verification and capture
   (a duplicate webhook does not
   double-book). Every transition is atomic and guarded - optimistic
   `version` or `UPDATE ... WHERE status = :expected`. See
   `idempotency-concurrency`.
7. **Fault Tolerance on the outbound adapter, retry only the idempotent
   call.** `@Retry` + `@CircuitBreaker` (+ `@Timeout`) wrap gateway calls on
   the adapter. Retry *verification* (idempotent by design); never retry a
   capture in a way that could book the ledger twice - capture is guarded by
   `attempt_reference`/`provider_reference` uniqueness. See `cdi-interceptors`.
8. **Never touch a PAN. PCI is out of scope.** The gateway hosts the payment
   page and collects the card; we store only tokens and our neutral references
   (`attempt_reference`, `provider_reference`) - never a card number, CVV, or
   expiry, in any table or log. See `pii-masking-logging`.
9. **Platform commission via subaccounts/split; the sale is booked at
   capture.** Commission is configured as a split on the charge, not
   hand-moved. The operational sale posts to the ledger at capture (see
   `ledger-double-entry`); the platform commission belongs to
   `platform-billing`, kept separate.
10. **Secrets come from injected config, never the repo.** The gateway keys
    and webhook secret are injected configuration; sandbox first, then prod.
    gitleaks gates the pipeline. See `ci-workflow`.
11. **No provider concept in the domain - ever.** `payments/domain` and
    `payments/application` contain no gateway SDK type, no provider-specific
    field, no provider name in an enum that drives business logic. Provider
    selection (country, currency, method, availability, cost) is a *routing
    policy* at the adapter/config edge, not a domain rule. ArchUnit enforces
    it: no `com.flutterwave..`/`com.stripe..`/`com.adyen..` import outside
    `payments/adapters/outbound/gateway`.
12. **Every gateway adapter passes the same contract test suite.** A shared
    `PaymentGatewayContractTest` (abstract, one concrete subclass per adapter,
    run against that gateway's sandbox or a WireMock double) asserts the
    invariants every provider must honour: initiate is idempotent for the same
    `attempt_reference`; verify is idempotent and returns amount + currency +
    reference; a mismatched amount/currency is reported as such; an unknown
    reference does not throw a raw SDK exception but a mapped domain failure.
    A new PSP is "done" when it passes this suite unchanged. See
    `backend-tests`.

## Anti-patterns

- `import com.flutterwave...` (or `com.stripe..`, `com.adyen..`) in
  `payments/domain` or `application` → rules 1 and 11; a gateway SDK lives only
  in `adapters/outbound/gateway`, behind `PaymentGatewayPort`.
- A `tx_ref` / `flw_ref` column, field, or port parameter → rule 2; the
  domain says `attempt_reference` / `provider_reference`, the adapter maps.
- `if (provider == FLUTTERWAVE)` inside a use case → rule 11; provider choice
  is routing/config at the edge, never a domain branch.
- Marking the order paid straight from the webhook JSON → rule 3; re-verify via
  the API by `attempt_reference` and let the API response decide.
- A webhook endpoint with no signature check → rule 3; verify the secret hash,
  reject a mismatch as RFC 7807.
- One `Payment` row mutated `pending → succeeded` in place → rule 2;
  `PaymentIntent` / `PaymentAttempt` (per `attempt_reference`) /
  `PaymentTransaction`.
- `@Transactional` around the Flutterwave HTTP call (DB tx held across the
  network) → rule 5; commit TX#1, call the gateway outside any transaction.
- Trusting `status == "successful"` without checking
  amount/currency/`attempt_reference`
  → rule 4; verify they match the intent.
- Storing the card PAN/CVV "to reconcile later" → rule 8; never; keep only
  `attempt_reference`/`provider_reference`.
- Reusing one `idempotency_key` across two orders, or omitting it → rule 6;
  `UNIQUE` per intent, duplicate initiate returns the existing one.
- A second PSP adapter shipped without running the shared contract suite →
  rule 12; the suite is what proves the abstraction actually holds.
- `@Retry` on a capture that re-posts the ledger → rule 7; retry the idempotent
  verify, guard capture by `attempt_reference` uniqueness.
- `flutterwave.secret=FLWSECK-...` in `application.properties` → rule 10; injected
  env/config, gitleaks-gated.

## Minimal correct example

```java
// payments/ports/outbound - the domain depends on THIS, never on a gateway.
// Provider-neutral vocabulary only: no tx_ref, no flw_ref, no SDK type.
public interface PaymentGatewayPort {
    GatewayInitiation initiate(PaymentAttempt attempt, Split commission);
    VerifiedCharge verify(String attemptReference); // idempotent; source of truth
}

// payments/adapters/outbound/gateway - the ONLY place Flutterwave exists.
@ApplicationScoped
public class FlutterwaveGatewayAdapter implements PaymentGatewayPort {

    private final FlutterwaveClient flw;   // Flutterwave types confined here

    @Inject
    public FlutterwaveGatewayAdapter(@RestClient FlutterwaveClient flw) {
        this.flw = flw;
    }

    @Override
    @Retry(maxRetries = 3) @CircuitBreaker(requestVolumeThreshold = 8) @Timeout
    public VerifiedCharge verify(String attemptReference) {
        // Flutterwave calls it tx_ref / flw_ref - the mapping stops HERE.
        FlwVerifyResponse r = flw.verifyByReference(attemptReference);
        return new VerifiedCharge(
            r.txRef(),                                   // -> attemptReference
            r.flwRef(),                                  // -> providerReference
            Money.ofMinor(r.amountMinor(), Currency.of(r.currency())), // typed; GNF scale 0
            r.status());
    }
}
```

```java
// payments/adapters/inbound/rest - verify the signature, then RE-VERIFY via API.
@POST @Path("/webhooks/flutterwave")
public Response onWebhook(@HeaderParam("verif-hash") String signature, String body) {
    if (!webhookVerifier.matches(signature)) {
        throw new InvalidWebhookSignatureException();     // -> RFC 7807 401
    }
    String ref = webhookVerifier.extractAttemptReference(body); // trigger, not truth
    capturePayment.captureIfVerified(ref);                      // idempotent
    return Response.noContent().build();
}
```

```java
// payments/application - saga TX#2. Verification (network) happens OUTSIDE the tx;
// the transactional step only persists, and stays a distinct bean so the network
// call is never held inside a DB transaction (rule 5).
@ApplicationScoped
public class CapturePaymentService {

    private final PaymentGatewayPort gateway;
    private final PaymentCaptureTx captureTx;   // separate @Transactional bean

    @Inject
    public CapturePaymentService(PaymentGatewayPort gateway, PaymentCaptureTx captureTx) {
        this.gateway = gateway;
        this.captureTx = captureTx;
    }

    public void captureIfVerified(String attemptReference) {
        VerifiedCharge charge = gateway.verify(attemptReference); // no DB tx here
        captureTx.persist(attemptReference, charge);
    }
}

@ApplicationScoped
class PaymentCaptureTx {

    private final PaymentAttemptRepository attempts;
    private final AccountingApi accounting;                     // ledger's inbound port
    private final OutboxEventPublisher outbox;

    private final MarkOrderPaidUseCase orderPayment;   // ordering's INBOUND port

    @Inject
    PaymentCaptureTx(PaymentAttemptRepository attempts,
                     AccountingApi accounting,
                     MarkOrderPaidUseCase orderPayment,
                     OutboxEventPublisher outbox) {
        this.attempts = attempts;
        this.accounting = accounting;
        this.orderPayment = orderPayment;
        this.outbox = outbox;
    }

    @Transactional
    void persist(String attemptReference, VerifiedCharge charge) {
        PaymentAttempt attempt = attempts.byAttemptReference(attemptReference);
        if (attempt.isSucceeded()) return;                // idempotent replay
        attempt.assertMatches(charge.amount(), charge.currency()); // amount+currency guard
        PaymentTransaction tx =
            attempt.markSucceeded(charge.providerReference(), charge.amount());
        accounting.post(saleEntry(attempt.orderId(), charge)); // sale AT CAPTURE
        // payments NEVER mutates ordering's aggregate: it calls ordering's
        // inbound port, which applies the guarded transition itself.
        orderPayment.markPaid(attempt.orderId(), attempt.orderVersion());
        outbox.record(new OrderPaid(attempt.orderId()));      // event, same tx
    }
}
```

No gateway type or gateway wording escapes the adapter; the webhook body is
never trusted; the
network call sits outside the transaction; capture and the ledger sale are
idempotent and booked exactly once.

## Sibling skills

- `money-currency` - the typed `Money`/`Currency` the adapter maps into (GNF
  scale 0), pinned by integration tests before prod.
- `ledger-double-entry` - the sale entry the capture books, at capture.
- `outbox-messaging` - the saga-by-outbox that replaces a distributed
  transaction; `InitiatePayment` / `OrderPaid`.
- `idempotency-concurrency` - `idempotency_key` UNIQUE, `provider_reference`
  dedupe, and the
  guarded state transitions.
- `backend-architecture` - the port in the domain, the Flutterwave adapter at
  the edge.
- `backend-di` - how CDI wires `PaymentGatewayPort` to the Flutterwave adapter.
- `cdi-interceptors` - Fault-Tolerance annotations compose on the adapter; money
  logic stays explicit in the service.
- `backend-exceptions` - `InvalidWebhookSignatureException` and mismatch errors
  as RFC 7807.
- `pii-masking-logging` - never log a PAN or an unmasked payment reference.
- `ci-workflow` - Flutterwave sandbox first; secret scanning; secrets out of the
  repo.
