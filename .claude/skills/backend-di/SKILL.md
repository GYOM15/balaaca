---
name: backend-di
description: Use when adding or wiring any CDI bean (@ApplicationScoped, @RequestScoped, a @Produces method, a *Resource, an interceptor, an adapter), when adding a dependency to an existing bean, when choosing a scope or injecting configuration or the Clock, when defining or reading TenantContext, or when reviewing a PR that puts @Inject on a field, adds a setter for a collaborator, `new`-s a collaborator inside a use case, or introduces static mutable state.
---

# backend-di

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Dependency injection with CDI (Quarkus/Jakarta). Constructor injection on
managed beans, correct scopes, no hidden collaborators inside the domain.

## When to use

- Adding any CDI-managed bean (`@ApplicationScoped`, `@RequestScoped`, a
  `@Produces` method, a Quarkus `*Resource`, an interceptor, an adapter).
- Adding a dependency to an existing bean.
- Reviewing a PR that adds `@Inject` on a field or `new`-s a collaborator.

## The rules

1. **Constructor injection only, on `private final` fields.** A bean declares
   its collaborators as `final` fields set by a single constructor; CDI
   selects it automatically. No `@Inject` on the constructor is required when
   it is the only one. This makes the bean instantiable in a plain unit test
   with hand-built collaborators — no container needed. Interceptors are
   production beans and follow the same rule (see `cdi-interceptors`).
2. **Never field injection (`@Inject` on a field) in production beans.** Not
   "just for now", and not in pure (non-container) unit tests. Field injection
   hides dependencies, defeats `final`, and forces the CDI container to
   construct the object even in a plain unit test. The one exception is a
   `@QuarkusTest` integration-test class, where `@Inject` on a field is the
   idiomatic way to obtain a container-managed collaborator (see
   `backend-tests`) — it stays banned in production beans and pure unit tests.
3. **Never setter injection.** Same reasons: it makes the bean mutable and
   hard to construct fully-formed.
4. **Choose the scope deliberately, default `@ApplicationScoped`.** Stateless
   services, application use cases, ports' adapters, gateways and repositories
   are `@ApplicationScoped` (one instance, thread-safe). Per-request state such
   as `TenantContext` is `@RequestScoped` and is populated ONLY by the
   `TenantBoundInterceptor`, which resolves the tenant from the DATABASE —
   verified JWT `sub` -> `users.keycloak_user_id` -> `users.id` ->
   `provider_staff.user_id` -> `provider_id` — on every request, uncached, so
   that removing a `provider_staff` row takes effect on the very next call. It
   is never parsed from a JWT claim and never injected as a business parameter
   (see `multi-tenant-rls`). Never use `@Singleton` as a substitute for
   `@ApplicationScoped`: `@ApplicationScoped` is a normal scope backed by a
   client proxy, which gives lazy initialization and lets the bean be
   replaced/mocked in `@QuarkusTest`. `@Singleton` is an eagerly constructed
   pseudo-scope with no client proxy. (Injected normal-scoped collaborators
   such as the `@RequestScoped` `TenantContext` are reached through their own
   proxies either way, so that is not the difference — and interceptors apply
   to `@Singleton` too, so they are not the reason either.)
5. **No static mutable state.** No `static` service locators, no `static`
   caches holding provider/appointment/money data, no mutable `public static`
   fields. Shared state lives in an `@ApplicationScoped` bean, in Redis, or in
   the database. Static is allowed only for true constants (`static final`).
6. **The domain never `new`-s an infrastructure collaborator, and is not a CDI
   bean.** Domain aggregates and value objects (`Appointment`,
   `AvailabilityRule`, `AvailabilityOverride`, `Money`, `PhoneNumber`) are
   plain constructed objects with zero framework imports. Application services
   depend on `ports` interfaces injected by CDI; the concrete adapter is wired
   by the container, never `new TwilioSmsAdapter()` from inside a use case (see
   `backend-architecture`).
7. **Configuration values via `@ConfigProperty`, structured config via a
   `@ConfigMapping` interface.** Inject a scalar with
   `@ConfigProperty(name = "...")` as a constructor parameter, or bind a group
   of related settings to a `@ConfigMapping` interface and inject that. Do not
   read `System.getenv` or `ConfigProvider.getConfig()` ad hoc inside a bean.
   Secrets come from the config source / secrets provider (a SmallRye Config
   source or the project's env/secret store), never hard-coded. The same rule
   covers ambient infrastructure that the domain needs as a value: a
   `java.time.Clock` is produced once and injected, never obtained by calling
   `Instant.now()` or `LocalDateTime.now()` inside a bean (see
   `temporal-modelling`).
8. **When a collaborator is genuinely optional, inject `Instance<T>` and
   resolve it explicitly** — do not scatter null checks. When two
   implementations of a port exist, disambiguate with a `@Named`/qualifier
   annotation, not by `instanceof`.
9. **A constructor with too many collaborators is an SRP smell, not a DI
   problem.** Five-plus injected ports usually means the bean does more than
   one thing — split it (see `backend-srp`), do not "solve" it with field
   injection or a god-service.

## Anti-patterns

- `@Inject private AppointmentRepository appointments;` -> rule 2, move it to a
  constructor `private final` field.
- `void setSmsSender(SmsSenderPort s) { this.smsSender = s; }` -> rule 3.
- `private static Map<String, Appointment> CACHE = new HashMap<>();` -> rule 5,
  put it behind an `@ApplicationScoped` bean, Redis, or Postgres — a static
  cache keyed without the tenant is also a cross-tenant leak.
- A Redis cache of `keycloak sub -> provider_id` consulted by
  `TenantBoundInterceptor` -> rule 4; a stale positive keeps a removed staff
  member working. The membership is read from `provider_staff` every request.
- `new TwilioSmsAdapter(...)` inside `SendAppointmentReminderService` ->
  rule 6, depend on the `SmsSenderPort` interface and let CDI inject it.
- `@Singleton` chosen by default for an ordinary stateless service -> rule 4,
  prefer `@ApplicationScoped` for lazy init and test mockability (an
  interceptor binding like `@TenantBound`/`@Idempotent` works on `@Singleton`
  too, so it is not the deciding factor).
- Reading `System.getenv("SMS_API_KEY")` in the adapter -> rule 7, inject it
  via `@ConfigProperty` / `@ConfigMapping` from the config source.
- `Instant.now()` called inside a service instead of `clock.instant()` ->
  rule 7; an un-injected clock makes slot arithmetic untestable.
- A use case with 8 injected ports -> rule 9, that's `backend-srp`.

## Minimal correct example

```java
// The bean is the *Service; the inbound port is the interface. No *ServiceImpl.
// NOTE: `booking` injects NO SMS gateway — it writes the notifications row in
// the same transaction and the notification-worker deployable sends it.
@ApplicationScoped
public class BookAppointmentService implements BookAppointmentUseCase {

    private final AppointmentRepository appointments;
    private final LookupServiceOfferingUseCase offerings; // duration + price
    private final OutboxEventPublisher outbox;
    private final Clock clock;

    // Single constructor -> CDI injects; no @Inject annotation needed.
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
        // the window is recomputed here from the offering's own duration and
        // buffers, and the price is frozen onto the appointment; the state
        // machine and the money stay in the domain, never in an interceptor
        ...
    }
}
```

**Canonical `TenantContext`** — this is THE definition for the whole codebase
(it lives in `com.balaaca.sharedkernel.tenancy`, together with the interceptor
that fills it; every other skill refers to this one, none redefines it). The
tenant is the **provider**, and it is resolved from the database, not from a
token claim:

```java
@RequestScoped
public class TenantContext {

    private ProviderId providerId;   // assigned once per request, fail-closed

    /**
     * The accessor business code uses. Throws when the interceptor resolved
     * no ACTIVE provider_staff membership for the verified JWT subject.
     */
    public ProviderId require() {
        if (providerId == null) throw new NoProviderMembershipException();
        return providerId;
    }

    /**
     * Read-only, non-throwing view for the connection-level hook that binds
     * the app.provider_id GUC. Empty means "bind the empty string", which the
     * RLS predicate turns into NULL and therefore into a deterministic 404
     * rather than a 500 (see `cdi-interceptors`, `multi-tenant-rls`).
     */
    public Optional<ProviderId> current() {
        return Optional.ofNullable(providerId);
    }

    // Package-private: ONLY the @TenantBound interceptor may fill or clear it.
    // It resolves sub -> users.id -> provider_staff.provider_id against the
    // database on every request, uncached, so no business code can assign a
    // tenant and no claim can forge one (see `cdi-interceptors`).
    void assign(ProviderId providerId) { this.providerId = providerId; }
    void clear() { this.providerId = null; }
}
```

`ProviderMembershipResolver`, the port that interceptor injects, is declared
next to `TenantContext` in `com.balaaca.sharedkernel.tenancy` and implemented
in the `providers` context: `shared-kernel` holds no business *rules*, but it
may declare cross-cutting ports.

The clock is produced once and injected everywhere, never called statically:

```java
@ApplicationScoped
public class TimeProducer {
    @Produces
    @ApplicationScoped
    public Clock clock() {
        return Clock.systemUTC();   // tests substitute a fixed clock
    }
}
```

Config binding, no ad-hoc env reads:

```java
@ConfigMapping(prefix = "notification.sms")
public interface SmsSenderConfig {
    String baseUrl();
    String apiKey();   // sourced from the config source / secrets provider
}
```

## Sibling skills

- `backend-architecture` — inward dependencies; the core depends on ports, CDI
  wires adapters at the edge, and `shared-kernel` is the one context exempt
  from the four-layer rule.
- `backend-srp` — a bloated constructor means too many responsibilities.
- `backend-naming` — port `*UseCase` + bean `*Service` (never `*ServiceImpl`),
  `*Repository`, `*Adapter` and final-field naming.
- `cdi-interceptors` — why `@ApplicationScoped` (proxy) matters for
  `@TenantBound`/`@Idempotent`/`@RateLimited`, and why the database GUC is
  bound by a connection hook rather than by the interceptor.
- `multi-tenant-rls` — `TenantContext` is `@RequestScoped`, resolved from the
  database, never a business parameter.
- `temporal-modelling` — why the `Clock` is injected rather than called.
- `code-language` — bean, field and config-key identifiers are English.
