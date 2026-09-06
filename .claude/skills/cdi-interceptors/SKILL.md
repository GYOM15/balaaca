---
name: cdi-interceptors
description: Use when adding a transaction boundary, audit trail, trace span, metric, TenantContext binding, idempotency guard or rate-limit check to a business method; when writing or ordering an @InterceptorBinding and its @Priority; when wiring the app.provider_id GUC that RLS reads; or when reviewing a PR that reaches for Spring @Aspect, reads the tenant from a JWT claim or a header, caches provider membership, or hides the frozen price or an appointment state transition inside an interceptor.
---

# cdi-interceptors

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Cross-cutting concerns are implemented with **Jakarta CDI
`@InterceptorBinding` + `@Interceptor`** (Quarkus), never with Spring AOP,
AspectJ weaving, or hand-rolled proxies. Interceptors stay thin, ordered,
and strictly limited to the approved concern list. **The frozen price and
the appointment state machine are always explicit in the domain and
application code - never hidden inside an interceptor.**

## When to use

- About to add a transaction boundary, an audit trail, a trace span, a
  metric, `TenantContext` binding, an idempotency guard, or a rate-limit
  check to a business method.
- About to type `Log.info` / `Log.debug` / `System.out` inside a domain,
  application, or adapter class - stop; a logging/audit concern belongs
  behind the `AuditTrail` port or the logging boundary, not inline (see
  `pii-masking-logging`).
- Wiring the `app.provider_id` GUC that the RLS policies read, or
  debugging queries that return nothing under RLS.
- Reviewing a PR that introduces `@Transactional`, timing code,
  `try/finally` metric blocks, or tenant plumbing scattered across a
  service - flag it and move it behind an interceptor binding.
- Tempted to reach for Spring's `@Aspect`/`@Around` - wrong framework;
  this project is Quarkus/CDI.

## The rules

1. **One `@InterceptorBinding` annotation per concern, one
   `@Interceptor` class that implements it.** Approved concerns only:
   transactions, `TenantContext` binding, and - should one ever earn it -
   audit, tracing, metrics, idempotency or rate-limit, none of which did
   (rule 4). Anything else - validation, mapping, slot arithmetic,
   pricing, state transitions - is explicit code, not an interceptor.
2. **The frozen price and the appointment state machine stay explicit in
   the domain, never inside an interceptor.** Copying a
   `ServiceOffering`'s price into `customer_price_amount_minor` /
   `customer_price_currency`, computing a `Money`, widening a candidate
   slot by the requested offering's buffers, deciding
   `PENDING -> CONFIRMED` - all stay visible in the booking path itself:
   `BookAppointmentAttempt` and the statement it issues. There is no
   `Appointment` aggregate to keep them in - booking hands the repository a
   `NewAppointment` and the INSERT writes the frozen price and reads the
   provider's `auto_confirm` for the status - which makes this rule
   sharper, not softer, because the only place left to hide them would be
   an interceptor. An interceptor may open the transaction around them; it
   must not perform them. This is a hard review gate: a reader following
   `BookAppointmentAttempt.once` must be able to see every rule that
   decided the appointment's price and status without opening an
   interceptor.
3. **Interceptors are thin and delegate.** No business branching. An
   interceptor reads context, calls `ctx.proceed()`, and records an
   outcome (span, metric, audit event). If it grows an `if` on a domain
   value - an offering's duration, an appointment's status, a plan's
   limit - the logic belongs in the domain.
4. **Order interceptors explicitly with `@Priority`, and write the number
   down.** Fixed outer→inner chain, bound to
   `jakarta.interceptor.Interceptor.Priority` offsets. There is exactly
   **one** interceptor binding in this codebase, and this table used to
   list six:

   | Concern             | Class                    | Priority                  |
   | ------------------- | ------------------------ | ------------------------- |
   | `@TenantBound`      | `TenantBoundInterceptor` | `PLATFORM_BEFORE + 10`    |
   | `@Transactional`    | Quarkus                  | `PLATFORM_BEFORE + 200`   |

   `PLATFORM_BEFORE + 200` is Quarkus's own transactional interceptor - it
   is not ours to move. Never rely on declaration order, and never leave a
   priority undocumented: the whole chain is read from these numbers.

   The four rows that are gone - tracing at `+5`, `@RateLimited` at `+20`,
   `@Idempotent` at `+30`, audit at `+210` - were **never written**.
   Nothing was deleted: the table described a plan, and the plan lost each
   time to the same objection, that the concern needs something from the
   method an annotation cannot ask for. **Tracing** is what the platform
   already does at the HTTP boundary. **Rate limiting is a call, not an
   annotation** - `AttemptLimiter` in `platformkernel.ratelimit`, and
   `GuessBudget` in booking where it has to fail closed - because the
   decision needs the caller's own key and puts a `Retry-After` on the
   response, neither of which an interceptor gets without the method
   handing it over. **Auditing is a port with two methods**, invoked by
   name: `AuditTrail.record` joins the caller's transaction, so a recorded
   success cannot commit while the change it describes rolls back, and
   `AuditTrail.recordRefusal` opens its own, because the refusal is what
   aborts that transaction. One `@Priority` cannot express both, and an
   interceptor would have had to pick one. Do not restore these rows from
   this file.
5. **`TenantContext` is bound by `TenantBoundInterceptor` from the
   verified JWT subject resolved against `provider_staff` in the
   database, fail-closed, with no cache.** The interceptor takes the
   subject from `AuthenticatedSubject`, never from an injected
   `JsonWebToken` - that bean only exists while the OIDC extension is
   active, so an injection point on it resolves to nothing the moment OIDC
   is off and every caller is refused with no way to tell that from a real
   refusal. It resolves
   `sub -> users.keycloak_user_id -> users.id -> provider_staff.user_id
   -> provider_staff.provider_id` through `ProviderMembershipResolver`
   (declared in `com.balaaca.platformkernel.tenancy`, implemented in
   `providers`), assigns the resulting `Membership` - provider, chair and
   role, not just an id - and clears it in `finally`. Zero memberships
   throws `NoProviderMembershipException`, and the port throws it itself:
   `requireFor` returns a `Membership`, not an `Optional` for the caller
   to unwrap and possibly forget.
   Never a `provider_id` claim, never a header, never a path or method
   parameter (see `multi-tenant-rls`). **There is deliberately no Redis
   cache on this path.** A five-minute positive cache of
   `subject -> provider_id` is a five-minute bearer token: delete a
   `provider_staff` row, miss the eviction, and a revoked staff member
   keeps working - a dual write across two failure domains that destroys
   the very reason the JWT claim was rejected, namely that revocation
   must take effect on the next request. The resolution is a two-join
   lookup on primary-key paths; at this product's volume the cache buys
   nothing and costs correctness.
6. **An interceptor binds `TenantContext`; it cannot bind the database
   GUC. That is a connection-level hook.** RLS reads
   `app.provider_id`, and the arithmetic of rule 4 says why the
   interceptor cannot set it: `@TenantBound` runs at
   `PLATFORM_BEFORE + 10`, Quarkus's transactional interceptor at
   `PLATFORM_BEFORE + 200`, and lower priority means further **out**.
   When `TenantBoundInterceptor` executes, no transaction has begun, so
   calling a `@Transactional(MANDATORY)` binder from it raises
   `TransactionRequiredException`, and a `set_config(..., true)` issued
   outside a transaction is scoped to a statement that is then discarded.
   The GUC is therefore bound by an Agroal connection-pool interceptor
   (or an equivalent Hibernate session-level integrator) that issues
   `SELECT set_config('app.provider_id', ?, true)` as the **first
   statement on the connection enlisted in the transaction**, reading the
   value from `TenantContext`. A connection hook, unlike an annotation,
   also covers every transaction opened without `@TenantBound` - `notification-worker` jobs, scheduled tasks, admin paths. Matching
   this, every RLS policy predicate in the codebase reads the GUC through
   `app_current_provider()` - `provider_id = app_current_provider()` - the
   `STABLE` function `V001` defines as
   `nullif(current_setting('app.provider_id', true), '')::uuid`. The
   expression is written once, in that one function body, precisely so no
   policy has to get it right on its own: `current_setting` without
   `missing_ok` raises `42704` and `''::uuid` raises `22P02`, whereas this
   form degrades to `NULL`, filters every row, and yields a deterministic
   `404` instead of a `500`.
7. **Idempotency is not an interceptor either, and there is no Redis
   replay record.** No `@Idempotent` binding was ever written. The header
   is bound on the resource method
   (`@HeaderParam("Idempotency-Key") @NotNull @Size(min = 1, max = 80)`),
   and the only authority is the partial index
   `UNIQUE (provider_id, idempotency_key) WHERE idempotency_key IS NOT
   NULL`, enforced inside the booking transaction by
   `INSERT … ON CONFLICT (provider_id, idempotency_key) WHERE
   idempotency_key IS NOT NULL DO NOTHING` - the index's predicate has to
   be repeated in the conflict target or PostgreSQL answers `42P10` - with
   `AppointmentRepository.replayOf(key, requestHash)` read **first**, in
   that same transaction, so a retry is handed what it asked for instead of
   being judged a second time against rules that may have moved. A cache in
   front of that would be a second answer to the same question living in a
   second failure domain, and the index is already the answer. A key
   replayed with a different request hash is `422 IDEMPOTENCY_KEY_REUSED`,
   raised where the replay is read; nothing ever fabricates an appointment
   to satisfy a retry (see `idempotency-concurrency`).
8. **No inline logging in intercepted classes.** Domain, application and
   adapter classes throw or return; the `AuditTrail` port and the logging
   boundary turn the outcome into a structured line - dotted lowercase
   event names such as `appointment.booked` and
   `appointment.book.slot_unavailable` - always through the masking
   helper. `provider_id` and `correlation_id`
   go into the MDC raw; identifiers that resolve to a natural person
   (`customer_id`, `user_id`, `appointment_id`) are masked (see
   `pii-masking-logging`).
9. **Domain events are published explicitly by the application code, then
   persisted via the outbox in the same transaction.** An interceptor
   never silently emits domain events as a side effect (see
   `outbox-messaging`). Keep the causal event visible where the state
   changes.
10. **Interceptors carry no persistent state.** Any store they consult
    (idempotency records, rate-limit counters) lives behind an injected
    port, so the interceptor stays testable and the storage stays
    swappable. No `static` map, no field mutated across invocations - interceptor instances are shared.

## Anti-patterns

- Spring `@Aspect` / `@Around` / `@Before` in this codebase → rule 1; use
  CDI `@InterceptorBinding` + `@Interceptor`.
- A `@Transactional` interceptor that also copies the offering price into
  `customer_price_amount_minor`, or flips `status` to `CONFIRMED` →
  rule 2; the freeze and the transition are explicit in the service.
- An interceptor with
  `if (offering.durationMinutes() > 60) requireDeposit()` → rule 3;
  business branching belongs in the domain.
- Chain behaviour depending on which bean was declared first, no
  `@Priority` → rule 4; pin the order and document the number.
- `tenantContext.assign(request.providerId())` from a DTO field, an
  `X-Provider-Id` header, or `jwt.getClaim("provider_id")` → rule 5; the
  tenant comes from the verified `sub` resolved against `provider_staff`,
  fail-closed with `NoProviderMembershipException`.
- A `RedisProviderMembershipResolver` caching `subject -> provider_id`
  for five minutes → rule 5; a stale positive is a revoked staff member
  still booking. No cache on the authorisation path.
- `TenantBoundInterceptor` calling a `@Transactional(MANDATORY)` session
  binder → rule 6; at `PLATFORM_BEFORE + 10` there is no transaction yet,
  so this throws at runtime on every request. Bind the GUC from the
  connection hook.
- An RLS policy written
  `provider_id = current_setting('app.provider_id')::uuid` → rule 6; it
  raises `42704`/`22P02` and turns a missing tenant into a `500`. Call
  `app_current_provider()`, which is that expression written safely, once.
- A new `@Idempotent` binding, or a Redis replay record in front of the
  idempotency index → rule 7; the partial unique index and `replayOf` are
  the whole mechanism, and a cache would be a second answer that can
  disagree.
- `Log.info("booked " + customer.phone())` inside
  `BookAppointmentService` → rule 8; the trail records it through
  `AuditTrail`, and the log line is masked.
- An interceptor that quietly calls
  `eventPublisher.fire(new AppointmentBooked(...))` the caller cannot see
  → rule 9; publish explicitly and record it in the outbox.
- A `private static final Map<String, Integer> COUNTERS` inside an
  interceptor or a limiter bean → rule 10; put it behind an injected port,
  the way `GuessBudget` and `AttemptLimiter` already are.

## Minimal correct example

```java
// The binding - one annotation per concern.
@InterceptorBinding
@Target({ ElementType.TYPE, ElementType.METHOD })
@Retention(RetentionPolicy.RUNTIME)
public @interface TenantBound {
}
```

```java
// com.balaaca.platformkernel.tenancy - same package as TenantContext, so
// assign/clear stay closed to every other class.
//
// Thin: resolves the provider from the DATABASE and binds TenantContext.
// No cache, no business logic, no price, no state transition.
@TenantBound
@Interceptor
@Priority(Interceptor.Priority.PLATFORM_BEFORE + 10)  // outside the tx
public class TenantBoundInterceptor {

    private final AuthenticatedSubject caller;
    private final TenantContext tenantContext;
    private final ProviderMembershipResolver memberships;
    private final AuditTrail audit;

    public TenantBoundInterceptor(AuthenticatedSubject caller,
                                  TenantContext tenantContext,
                                  ProviderMembershipResolver memberships,
                                  AuditTrail audit) {
        this.caller = caller;
        this.tenantContext = tenantContext;
        this.memberships = memberships;
        this.audit = audit;
    }

    @AroundInvoke
    Object bind(InvocationContext ctx) throws Exception {
        // From SecurityIdentity, not an injected JsonWebToken: that bean
        // disappears with the OIDC extension and takes every caller with it.
        String subject = caller.subject().orElse(null);
        if (subject == null) {
            throw refused(ctx, new NoProviderMembershipException(null));
        }
        try {
            // The token carries identity (sub) and global roles only.
            // Membership is read from provider_staff on every request, so a
            // revocation takes effect on the next call. Deliberately uncached.
            tenantContext.assign(memberships.requireFor(subject));
        } catch (DomainException e) {
            throw refused(ctx, e);
        }
        try {
            return ctx.proceed();
        } catch (DomainException e) {
            throw refused(ctx, e);
        } finally {
            tenantContext.clear();
        }
    }

    // Auditing a refusal is a CALL, not a second interceptor: it has to run
    // while the tenant is still bound, because this finally clears it long
    // before any JAX-RS mapper would see the exception.
    private DomainException refused(InvocationContext ctx, DomainException e) { ... }
}
```

The database GUC cannot be set from that interceptor - at
`PLATFORM_BEFORE + 10` it runs outside the transaction Quarkus opens at
`PLATFORM_BEFORE + 200`. It is bound on the connection instead, as the
first statement issued on the connection the transaction enlists:

```java
// com.balaaca.platformkernel.tenancy - connection-level, so it also covers
// transactions opened without @TenantBound (worker jobs, scheduled tasks).
@ApplicationScoped
public class TenantGucPoolInterceptor implements AgroalPoolInterceptor {

    private static final String BIND =
        "SELECT set_config('app.provider_id', ?, true)";  // true = SET LOCAL

    private final TenantContext tenantContext;

    public TenantGucPoolInterceptor(TenantContext tenantContext) {
        this.tenantContext = tenantContext;
    }

    @Override
    public void onConnectionAcquire(Connection connection) {
        // The request-context test is not optional. Flyway at startup, the
        // readiness probe and every scheduled job acquire a connection with no
        // request in flight, and touching a @RequestScoped bean there throws
        // ContextNotActiveException rather than returning empty.
        //
        // No resolved tenant -> bind the empty string. app_current_provider()
        // is then NULL, so every row is filtered and the API answers 404
        // instead of raising 42704/22P02 and returning 500.
        String value = "";
        if (Arc.container().requestContext().isActive()) {
            value = tenantContext.current().map(ProviderId::toString).orElse("");
        }
        try (PreparedStatement ps = connection.prepareStatement(BIND)) {
            ps.setString(1, value);
            ps.execute();
        } catch (SQLException e) {
            throw new TenantBindingFailedException(e);
        }
    }
}
```

Note where `@TenantBound` goes: on the **resource class**, beside
`@Authenticated`, never on an application service. The edge is where a
caller becomes a tenant, and putting the binding there means no service can
be reached with the tenant unresolved. `BookAppointmentAttempt` below
carries no tenant annotation at all, and reads `TenantContext` through the
repository like everything else.

The application code stays explicit about the frozen price and the state
machine. The transaction is its own annotation, on the class that owns one
attempt:

```java
@ApplicationScoped
public class BookAppointmentAttempt {

    private final LookupServiceOfferingUseCase offerings;
    private final CalculateSlotsUseCase slots;
    private final AppointmentRepository appointments;
    private final BookingNotifications notifications;

    // constructor injection, as everywhere - see backend-di

    // REQUIRES_NEW, and separate from BookAppointmentService for a reason:
    // a lost race leaves this transaction rollback-only, so the retry needs
    // a fresh one. No interceptor can express that; the caller loops.
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public InsertOutcome once(BookAppointmentCommand command, List<StaffId> excluded) {
        BookableOffering offering =
            offerings.requireBookable(command.serviceOfferingId());

        // Visible here, never in an interceptor: the window is recomputed
        // server-side from the offering's own duration and buffers, and the
        // offering is carried into the insert so the row freezes its price
        // into customer_price_amount_minor / customer_price_currency.
        BookedSlot slot = BookedSlot.from(command.startsAt(), offering.duration(),
                                          offering.bufferBefore(), offering.bufferAfter());

        // The replay is read FIRST, in this transaction. A retry is not a new
        // request: the slot it took may since have closed, and refusing the
        // retry would leave the caller believing nothing was booked.
        Optional<InsertOutcome> replay = command.idempotency()
                .flatMap(i -> appointments.replayOf(i.key(), i.requestHash()));
        if (replay.isPresent()) {
            return replay.get();
        }

        // ... blocking, availability, fulfilment and staff checks, each an
        // explicit call, each throwing its own domain exception ...

        // ON CONFLICT (provider_id, idempotency_key) WHERE idempotency_key
        // IS NOT NULL DO NOTHING: the index arbitrates the replay, and a
        // 23P01 from the exclusion constraint still surfaces as
        // SLOT_UNAVAILABLE rather than being swallowed as a duplicate.
        InsertOutcome outcome = appointments.insertIfAbsent(new NewAppointment(...));

        // Planned where the state changed, not by a hidden interceptor, and
        // written through the outbox port inside this same transaction.
        if (!outcome.replayed()) {
            notifications.planFor(outcome.appointmentId(), outcome.reference(), ...);
        }
        return outcome;
    }
}
```

## Sibling skills

- `multi-tenant-rls` - the tenant resolution chain, the RLS policies this
  interceptor and the connection hook feed, and the `404` rule.
- `backend-di` - the canonical `TenantContext`, and why an interceptor is
  a production bean that uses constructor injection.
- `idempotency-concurrency` - why the in-transaction partial UNIQUE index
  and `replayOf` are the whole mechanism, with no guard in front.
- `pii-masking-logging` - the audit trail masks person-resolving
  identifiers and logs `provider_id` raw.
- `outbox-messaging` - domain events are published explicitly then
  persisted via the outbox, not emitted by an interceptor.
- `money-currency` - the typed `Money` an interceptor must never compute.
- `backend-naming` - `@TenantBound` / `TenantBoundInterceptor`,
  `NoProviderMembershipException`, `insertIfAbsent`, and the rest of the
  settled vocabulary used above.
- `backend-srp` - one interceptor, one concern.
- `backend-architecture` - where interceptors sit relative to
  domain/application/ports/adapters, and why `shared-kernel` is the one
  context exempt from the four-layer rule.
