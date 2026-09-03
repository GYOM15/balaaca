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
  in an interceptor (see `pii-masking-logging`).
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
   transactions, audit, tracing, metrics, `TenantContext` binding,
   idempotency, rate-limit. Anything else - validation, mapping, slot
   arithmetic, pricing, state transitions - is explicit code, not an
   interceptor.
2. **The frozen price and the appointment state machine stay explicit in
   the domain, never inside an interceptor.** Copying a
   `ServiceOffering`'s price into `customer_price_amount_minor` /
   `customer_price_currency`, computing a `Money`, widening a candidate
   slot by the requested offering's buffers, deciding
   `PENDING -> CONFIRMED` - all stay visible in the application service
   and the aggregate. An interceptor may open the transaction around
   them; it must not perform them. This is a hard review gate: a reader
   of `BookAppointmentService` must be able to see every rule that
   decided the appointment's price and status without opening an
   interceptor.
3. **Interceptors are thin and delegate.** No business branching. An
   interceptor reads context, calls `ctx.proceed()`, and records an
   outcome (span, metric, audit event). If it grows an `if` on a domain
   value - an offering's duration, an appointment's status, a plan's
   limit - the logic belongs in the domain.
4. **Order interceptors explicitly with `@Priority`, and write the number
   down.** Fixed outer→inner chain, bound to
   `jakarta.interceptor.Interceptor.Priority` offsets:

   | Concern             | Priority                  |
   | ------------------- | ------------------------- |
   | tracing             | `PLATFORM_BEFORE + 5`     |
   | `@TenantBound`      | `PLATFORM_BEFORE + 10`    |
   | `@RateLimited`      | `PLATFORM_BEFORE + 20`    |
   | `@Idempotent`       | `PLATFORM_BEFORE + 30`    |
   | `@Transactional`    | `PLATFORM_BEFORE + 200`   |
   | audit               | `PLATFORM_BEFORE + 210`   |

   `PLATFORM_BEFORE + 200` is Quarkus's own transactional interceptor - it is not ours to move. Audit sits at `+210`, inside the transaction,
   so an audit row commits or rolls back with the change it describes.
   Never rely on declaration order, and never leave a priority
   undocumented: the whole chain is read from these numbers.
5. **`TenantContext` is bound by `TenantBoundInterceptor` from the
   verified JWT subject resolved against `provider_staff` in the
   database, fail-closed, with no cache.** The interceptor reads
   `jwt.getSubject()`, resolves
   `sub -> users.keycloak_user_id -> users.id -> provider_staff.user_id
   -> provider_staff.provider_id` through `ProviderMembershipResolver`
   (declared in `com.balaaca.sharedkernel.tenancy`, implemented in
   `providers`), assigns the resulting `ProviderId`, and clears it in
   `finally`. Zero memberships throws `NoProviderMembershipException`.
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
   this, every RLS policy predicate in the codebase is
   `provider_id = nullif(current_setting('app.provider_id', true),
   '')::uuid`: `current_setting` without `missing_ok` raises `42704` and
   `''::uuid` raises `22P02`, whereas this form degrades to `NULL`,
   filters every row, and yields a deterministic `404` instead of a
   `500`.
7. **Idempotency and rate-limit are interceptors; they guard, they never
   compute results, and they are never the only guard.** The
   `@Idempotent` interceptor keys off the `Idempotency-Key` header. It
   may short-circuit a replay it can *prove* - same provider, same key,
   same `idempotency_request_hash`, stored response in hand - and it may
   consult a Redis record to do so. The authority remains
   `UNIQUE (provider_id, idempotency_key)`, enforced inside the booking
   transaction by `INSERT … ON CONFLICT (provider_id, idempotency_key)
   DO NOTHING` followed by a `SELECT`. The two compose by falling
   through: with Redis cold, every request reaches the index and the
   outcome is byte-identical, only slower. The interceptor never
   fabricates an `Appointment`, and a key replayed with a different
   request hash is `422 IDEMPOTENCY_KEY_REUSED` raised by the service,
   not a guess made in the interceptor (see `idempotency-concurrency`).
8. **No inline logging in intercepted classes.** Domain, application and
   adapter classes throw or return; an audit or logging interceptor turns
   the outcome into a structured line - dotted lowercase event names such
   as `appointment.booked` and `appointment.book.slot_unavailable` - always through the masking helper. `provider_id` and `correlation_id`
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
  raises `42704`/`22P02` and turns a missing tenant into a `500`. Use the
  `nullif(current_setting(…, true), '')::uuid` form.
- An idempotency interceptor that builds and returns a fresh
  `Appointment` on replay, or that is the only thing preventing a
  duplicate booking when Redis is cold → rule 7.
- `Log.info("booked " + customer.phone())` inside
  `BookAppointmentService` → rule 8; the audit interceptor emits
  `appointment.booked`, masked.
- An interceptor that quietly calls
  `eventPublisher.fire(new AppointmentBooked(...))` the caller cannot see
  → rule 9; publish explicitly and record it in the outbox.
- A `private static final Map<String, Integer> COUNTERS` inside the
  rate-limit interceptor → rule 10; put it behind an injected port.

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
// com.balaaca.sharedkernel.tenancy - same package as TenantContext, so
// assign/clear stay closed to every other class.
//
// Thin: resolves the provider from the DATABASE and binds TenantContext.
// No cache, no business logic, no price, no state transition.
@TenantBound
@Interceptor
@Priority(Interceptor.Priority.PLATFORM_BEFORE + 10)  // outside the tx
public class TenantBoundInterceptor {

    private final JsonWebToken jwt;
    private final TenantContext tenantContext;
    private final ProviderMembershipResolver memberships;

    public TenantBoundInterceptor(JsonWebToken jwt,
                                  TenantContext tenantContext,
                                  ProviderMembershipResolver memberships) {
        this.jwt = jwt;
        this.tenantContext = tenantContext;
        this.memberships = memberships;
    }

    @AroundInvoke
    Object bind(InvocationContext ctx) throws Exception {
        String subject = jwt.getSubject();
        if (subject == null || subject.isBlank()) {
            throw new UnauthenticatedException();
        }
        // The JWT carries identity (sub) and global roles only. Tenant
        // membership is read from provider_staff on every request, so a
        // revocation takes effect on the next call. Deliberately uncached.
        ProviderId provider = memberships.resolve(subject)
                .orElseThrow(NoProviderMembershipException::new);

        tenantContext.assign(provider);
        try {
            return ctx.proceed();
        } finally {
            tenantContext.clear();
        }
    }
}
```

The database GUC cannot be set from that interceptor - at
`PLATFORM_BEFORE + 10` it runs outside the transaction Quarkus opens at
`PLATFORM_BEFORE + 200`. It is bound on the connection instead, as the
first statement issued on the connection the transaction enlists:

```java
// com.balaaca.sharedkernel.tenancy - connection-level, so it also covers
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
        // No resolved tenant -> bind the empty string. The policy reads
        // nullif(current_setting('app.provider_id', true), '')::uuid, which
        // is then NULL, so every row is filtered and the API answers 404
        // instead of raising 42704/22P02 and returning 500.
        String value = tenantContext.current()
                .map(p -> p.value().toString())
                .orElse("");
        try (PreparedStatement ps = connection.prepareStatement(BIND)) {
            ps.setString(1, value);
            ps.execute();
        } catch (SQLException e) {
            throw new TenantBindingFailedException(e);
        }
    }
}
```

The application service stays explicit about the frozen price and the
state machine. The interceptors only bound the tenant and the transaction:

```java
@ApplicationScoped
public class BookAppointmentService implements BookAppointmentUseCase {

    private final AppointmentRepository appointments;
    private final LookupServiceOfferingUseCase offerings;
    private final OutboxEventPublisher outbox;
    private final Clock clock;

    public BookAppointmentService(AppointmentRepository appointments,
                                  LookupServiceOfferingUseCase offerings,
                                  OutboxEventPublisher outbox,
                                  Clock clock) {
        this.appointments = appointments;
        this.offerings = offerings;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Override
    @TenantBound
    @Transactional
    public AppointmentId book(BookAppointmentCommand command) {
        ServiceOffering offering =
            offerings.require(command.serviceOfferingId());

        // Visible here, never in an interceptor: the price is frozen onto
        // the appointment, and the window is recomputed server-side from
        // the offering's own duration and buffers.
        Money customerPrice = offering.customerPrice();
        Appointment candidate =
            Appointment.request(command, offering, customerPrice, clock);

        // ON CONFLICT (provider_id, idempotency_key) DO NOTHING, then read
        // back: the index arbitrates the replay, a 23P01 from the exclusion
        // constraint still surfaces as SLOT_UNAVAILABLE.
        appointments.insertIfAbsent(candidate);
        Appointment stored =
            appointments.requireByIdempotencyKey(command.idempotencyKey());

        // The event is published where the state changed, not by a hidden
        // interceptor, and lands in the outbox inside this transaction.
        outbox.record(new AppointmentBooked(stored.id()));
        return stored.id();
    }
}
```

## Sibling skills

- `multi-tenant-rls` - the tenant resolution chain, the RLS policies this
  interceptor and the connection hook feed, and the `404` rule.
- `backend-di` - the canonical `TenantContext`, and why an interceptor is
  a production bean that uses constructor injection.
- `idempotency-concurrency` - how the `@Idempotent` short-circuit and the
  in-transaction UNIQUE index compose.
- `pii-masking-logging` - the audit interceptor masks person-resolving
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
