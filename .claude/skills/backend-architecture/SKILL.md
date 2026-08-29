---
name: backend-architecture
description: Defines Balaaca's modular-monolith and hexagonal layout. Use when creating a bounded context or Maven module, deciding which of the four layers a new class belongs in, wiring one core context to another or to a satellite, placing a cross-cutting port in shared-kernel, arguing about extracting a service, or reviewing a PR for a layer violation, an HTTP hop between core contexts, a .proto file, or a core module importing another's domain, application or adapters.
---

# backend-architecture

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Modular monolith + hexagonal layout for every bounded context in Balaaca,
the service-provider hub. Domain at the center, infra at the edges,
dependencies point INWARD, and the communication matrix between modules is
strict.

## When to use

- Creating a new bounded context (a new Maven module).
- Placing a new class — deciding which of the four layers it belongs in.
- Wiring one core module to another, or a core module to a satellite.
- Deciding where a cross-cutting port belongs.
- Reviewing a PR for a layer violation or a forbidden call path.

## The shape

The system is ONE deployable core (a modular monolith with an ACID
transactional core) plus a small number of satellites, each extracted only
against a named driver. Never K8s or microservices on day 1. The real
deployment target is a VPS; a Raspberry Pi is a transitional first step
only, so images are multi-arch, but nothing in the design is sized for a
Pi.

Core bounded contexts, one Maven module each. **This list is closed** —
adding a module is an architectural decision, not a refactor:

| module | owns |
| --- | --- |
| `shared-kernel` | `Money`, `Currency`, `PhoneNumber`, `TenantContext`, clock/time support, RFC 7807 problem types, `LogMasking`, `DomainException`, and the cross-cutting ports named below |
| `identity` | `users`, the link between a Keycloak subject and a local business user, global roles |
| `providers` | THE TENANT ROOT: `providers`, `provider_staff`, `provider_categories`, slug, public profile, booking policy |
| `catalog` | `service_offerings` — the provider's sellable services: name, duration, price, buffers, visibility |
| `scheduling` | `availability_rules`, `availability_overrides`, the pure slot-calculation domain service |
| `booking` | `appointments`, `customers` (the provider's address book), the appointment state machine, anti-double-booking |
| `billing` | `subscriptions` and plan ENTITLEMENTS (quotas). No payment collection, no PSP, no invoicing |

Satellites, each its own deployable:

- `notification-worker` — drains the `notifications` table and sends
  messages.
- `chatbot-service` — skeleton; calls the business API, NEVER the database.

`shared-kernel` holds only stable types with no dependency on another
module. It holds no business RULES — no pricing policy, no state machine,
no availability logic — but it MAY declare cross-cutting **ports**: an
interface whose contract is needed by the platform plumbing and whose
implementation belongs to exactly one context. `ProviderMembershipResolver`
is the canonical case: declared in `com.balaaca.sharedkernel.tenancy`
because `TenantBoundInterceptor` lives there, implemented in `providers`,
which owns `provider_staff`. Without this allowance the tenancy plumbing
could not compile without depending on a context, which rule 1 forbids.

## The four layers (every module)

Under `com.balaaca.<context>.*`:

1. **`domain/`** — aggregates, entities, value objects, domain services,
   domain events, domain exceptions, invariants. Framework-free: ZERO
   imports of Quarkus, CDI, Hibernate, JAX-RS. May reference only
   `domain/` itself and `shared-kernel` types.
2. **`ports/`** — interfaces only. `ports/inbound/` = `*UseCase`
   interfaces the module exposes (its published API). `ports/outbound/` =
   `*Repository` (persistence) and `*Port` (gateways) the core needs.
   Ports reference domain types, nothing from `adapters/`.
3. **`application/`** — `*Service` CDI beans implementing an inbound port.
   Orchestration only: transaction boundaries, `TenantContext` reads,
   idempotency guards, entitlement checks. NEVER `*ServiceImpl`.
4. **`adapters/`** — the edges. `adapters/inbound/{rest}` drives the
   application through inbound ports; `adapters/outbound/{persistence,
   gateway,messaging}` implements outbound ports. Adapters are named for
   their technology: `AppointmentPanacheRepository`, never `*Impl`.

**`shared-kernel` is the ONE context exempt from this four-layer rule.** It
is not a bounded context and has no aggregates to protect; it is laid out
by concern instead, as
`com.balaaca.sharedkernel.{money,time,logging,tenancy,error}`. Do not
create `shared-kernel/domain/` or `shared-kernel/adapters/`, and do not
write `com.balaaca.shared.*` — that package does not exist.

## The rules

1. **Dependencies point inward only:**
   ```
   adapters/  → application/ → ports/ → domain/
   adapters/  also implement ports/outbound and call ports/inbound
   ```
   `domain/` imports nothing from the other three layers or any framework.
   `application/` imports `domain/` + `ports/`, never `adapters/`. An
   `adapters/outbound/` class implements a `ports/outbound/` interface; it
   is never itself the port. Every context may depend on `shared-kernel`;
   `shared-kernel` depends on no context.
2. **Ports are owned by the core, implemented at the edge.** A repository
   interface (`AppointmentRepository`) lives in `ports/outbound/`; its
   Hibernate implementation (`AppointmentPanacheRepository`) lives in
   `adapters/outbound/persistence/`. Never invert this. The same shape
   holds for the cross-cutting ports of `shared-kernel`: the interface is
   declared where the plumbing needs it, the implementation lives in the
   context that owns the data.
3. **Core module → core module = an in-process Java call through the
   callee's published inbound port.** `booking` injects `catalog`'s
   `LookupServiceOfferingUseCase` (a CDI bean) via constructor injection
   and calls it in-process. NEVER HTTP, NEVER any network hop between core
   modules. Only `ports/inbound/` types and the domain types they expose
   may be referenced across contexts.
4. **The ports-only boundary is enforced by ArchUnit, not by the
   compiler — say so, and stop trying to fake it.** Depending on a
   context's Maven artifact puts its `domain/`, `application/` and
   `adapters/` on the classpath; Maven has no way to publish a subset of
   packages. Keep ONE Maven module per context and enforce the boundary
   with an ArchUnit rule (rule 8). Do NOT split each context into
   `api`/`impl` modules to buy compiler enforcement: it doubles the module
   count, spreads one context's classes across two artifacts, and still
   fails the moment someone adds the `impl` module as a dependency.
5. **Core module → satellite = a row in the `notifications` table, written
   in the SAME transaction as the business change.** That table IS the
   transactional outbox. There is NO broker: no Kafka, no Redpanda. The
   `notification-worker`, a separate deployable, drains it with
   `SELECT ... FOR UPDATE SKIP LOCKED` and marks a row `SENT` only after
   the channel acknowledges. Delivery is at-least-once, so consumers dedupe
   on the `UNIQUE` `dedupe_key`. A broker is deferred until volume
   justifies it; the table-as-outbox already gives transactional safety
   without one. See `outbox-messaging`.
6. **There is NO gRPC and NO `.proto` anywhere in this project.** Not
   between core modules (rule 3 covers those), not to the satellites (rule
   5 covers those), not to `chatbot-service`, which talks to the business
   API over REST like any other client. Do not add a `.proto` file, a
   protobuf plugin, or a gRPC dependency; if a future deployable needs a
   synchronous contract, it is REST under `contract-first` unless an ADR
   says otherwise.
7. **Client → core = REST/OpenAPI, contract-first.** ONE hand-authored
   OpenAPI document, held in the runner/API module, is the source of truth;
   server interfaces are generated into `target/` and never committed.
   Routes carry a version segment (`/v1/appointments`,
   `/v1/service-offerings`), every JSON property and query parameter is
   `snake_case`, and all HTTP errors are RFC 7807
   `application/problem+json` with stable SCREAMING_SNAKE_CASE codes. No
   tenant identifier ever appears in a request. See `contract-first` and
   `platform-api`.
8. **ArchUnit enforces every boundary in CI.** There MUST be tests that
   assert: `domain` has no framework imports; layers only depend inward; no
   core module imports another core module's `..domain..`, `..application..`
   or `..adapters..` — an explicit allowlist names the published types a
   cross-context call may touch (the inbound port, its command and result
   records, and the ids they carry); the closed context list holds, with the
   satellite deployables admitted alongside the seven core contexts; and no
   HTTP-client or messaging type appears on a core→core call path. See
   `backend-tests`.
9. **Do not over-architect.** No full event sourcing, no full CQRS, no K8s,
   no service mesh, no broker, no gRPC inside or outside the monolith. Every
   one of those is added only when a concrete, written-down need forces it —
   never because it is the modern shape.
10. **Extract a service only against a NAMED driver, and never split the
    booking transaction.** A module leaves the monolith when one of these is
    true and written down in an ADR: independent scaling, fault isolation,
    an independent deployment cadence, separate ownership, a technology the
    monolith cannot host, or a regulatory/security boundary. "It feels
    cleaner" and "microservices are modern" are not drivers.
    **The booking write path — the appointment insert, the availability
    check behind it, the customer upsert and the `notifications` rows —
    commits as ONE transaction and stays together**: splitting it replaces
    one ACID transaction (whose exclusion constraint is what makes
    double-booking impossible) with a saga plus compensations, which is
    precisely where booking systems break. Plan ENTITLEMENT checks stay
    in-process forever, because they sit on core write paths and a write
    must not depend on a network hop to decide whether it is allowed.
    Extraction changes the DEPLOYMENT boundary; the business boundary (the
    port) does not move, which is why extraction is cheap here.
11. **No synchronous chains — the distributed-monolith test.** A single
    inbound request must not depend on a chain of synchronous cross-module
    calls that must all succeed. Before adding a synchronous hop, ask:
    *does the caller need this result to answer, right now?* If yes, it is
    an in-process port call (rule 3). If no, it is an outbox row (rule 5).
    A request whose success depends on three or more deployables being up at
    once is a distributed monolith wearing a microservice costume — it has
    the coupling of the former and the failure modes of the latter.


> **A `domain/` package imports no other context, not even its ports.** The
> inward rule is usually stated about layers; it binds across contexts too. A
> domain type that takes another context's published DTO as a parameter drags
> that context into its own definition, and every later reshape of the DTO
> ripples into a domain that has no business knowing it exists.
>
> Caught here for real: `BookedSlot.from(Instant, BookableOffering)` made
> `booking/domain` depend on `catalog/ports/inbound`. The fix costs nothing -
> the factory takes the three `Duration` values it actually uses, and the two
> contexts meet in `application/`, which is where a use case is allowed to know
> about both.
>
> Enforce it: an ArchUnit rule asserting that `..<context>.domain..` depends only
> on itself and `sharedkernel`. Grepping the imports of every `domain/` package
> is a thirty-second check and finds it immediately.

## Anti-patterns

- A domain type whose factory or field mentions another context's port DTO ->
  the domain now depends on that context. Pass the primitives it uses, and let
  the application layer be where two contexts meet.

- `booking` calling `scheduling` or `catalog` over HTTP → rule 3. They are
  in the same monolith; inject the inbound port and call it in-process.
- `booking` importing `com.balaaca.catalog.domain.ServiceOfferingEntity` or
  calling `CatalogQueryService` directly because the classpath allows it →
  rules 3 and 4. The compiler will not stop you; ArchUnit will.
- Splitting `catalog` into `catalog-api` and `catalog-impl` to make the
  boundary compile-enforced → rule 4. One module per context; the rule
  lives in ArchUnit.
- Putting `ProviderMembershipResolver`'s JDBC implementation in
  `shared-kernel` so "it's all in one place" → rule 2. The port is declared
  in `sharedkernel.tenancy`; the implementation belongs to `providers`,
  which owns `provider_staff`.
- Giving `shared-kernel` a `domain/` package, or a pricing rule, or a
  dependency on `catalog` → the four-layer exemption is a layout exemption,
  not a licence to hold business rules or point outward (rule 1).
- A `.proto` file, a gRPC dependency, or a protobuf Maven plugin appearing
  anywhere in the tree → rule 6. Delete it; nothing in Balaaca speaks gRPC.
- A JAX-RS resource `@Inject`-ing an `AppointmentRepository` and running the
  state machine itself → rule 1. Resource → inbound port → application
  service → outbound port.
- `@Entity` / `@ApplicationScoped` / `@Transactional` on a class in
  `domain/` → rule 1. The domain stays framework-free; persistence mapping
  lives in `adapters/outbound/persistence/`.
- An interface named `...Port` sitting in `adapters/` → rule 2. Ports live
  in `ports/`; adapters implement them.
- The core calling `notification-worker` synchronously to "just send the
  SMS", or writing straight to a broker → rule 5. Insert the `notifications`
  row in the booking transaction and let the worker drain it.
- Adding Kafka or Redpanda "so the worker scales" → rules 5 and 9. The table
  with `SKIP LOCKED` is the transport until measured volume says otherwise.
- One `META-INF/openapi.yaml` per Maven module → rule 7. They collide on the
  classpath and SmallRye serves whichever wins; keep one document in the
  runner module.
- `billing` exposed as an HTTP call so `catalog` can ask "may this provider
  add another service?" → rule 10. Entitlement checks are an in-process
  inbound-port call on the write path.
- Extracting `scheduling` from `booking` "for clean separation" → rule 10.
  The availability check and the appointment insert must commit together.
- A `common/` or `util/` grab-bag module → put stable shared types in
  `shared-kernel`; everything else belongs to a specific context.

## Minimal correct example

`booking` prices an appointment using `catalog` and validates the slot using
`scheduling`, both in-process, persists it under the PostgreSQL exclusion
constraint, and notifies the satellite through the outbox — all in one
transaction.

```
booking/
├── domain/
│   ├── Appointment.java                    # aggregate, state machine, no framework
│   ├── Customer.java                       # the provider's address book entry
│   └── event/AppointmentBooked.java        # domain event
├── ports/
│   ├── inbound/BookAppointmentUseCase.java # published API of this module
│   └── outbound/AppointmentRepository.java # driven port
└── application/
    └── BookAppointmentService.java         # orchestrates domain + ports

catalog/ports/inbound/LookupServiceOfferingUseCase.java  # in-process, used by booking
scheduling/ports/inbound/SlotAvailabilityUseCase.java    # in-process, used by booking
billing/ports/inbound/EntitlementCheckUseCase.java       # in-process, write-path guard

booking/adapters/outbound/persistence/AppointmentPanacheRepository.java
booking/adapters/outbound/messaging/NotificationOutboxWriter.java
```

```java
// booking/application/BookAppointmentService.java
@ApplicationScoped
public class BookAppointmentService implements BookAppointmentUseCase {

    private final LookupServiceOfferingUseCase serviceOfferings; // catalog
    private final SlotAvailabilityUseCase availability;          // scheduling
    private final StaffAssignment staffAssignment;               // booking domain
    private final AppointmentRepository appointments;            // outbound port
    private final CustomerRepository customers;                  // outbound port
    private final NotificationOutboxPort notifications;          // core -> satellite
    private final Clock clock;

    @Inject
    public BookAppointmentService(LookupServiceOfferingUseCase serviceOfferings,
                                  SlotAvailabilityUseCase availability,
                                  StaffAssignment staffAssignment,
                                  AppointmentRepository appointments,
                                  CustomerRepository customers,
                                  NotificationOutboxPort notifications,
                                  Clock clock) {
        this.serviceOfferings = serviceOfferings;
        this.availability = availability;
        this.staffAssignment = staffAssignment;
        this.appointments = appointments;
        this.customers = customers;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Override
    @TenantBound
    @Transactional
    public AppointmentId book(BookAppointmentCommand command) {
        // provider_id is ambient: TenantContext, never a parameter.
        // Duration, buffers and price come from the service offering, never
        // from the client.
        ServiceOffering offering =
            serviceOfferings.require(command.serviceOfferingId());

        // "Any available staff" becomes a concrete staff member BEFORE the
        // insert; a client-named staff member is used as given.
        StaffId staffId = command.staffId()
            .orElseGet(() -> staffAssignment.pick(offering, command.startsAt()));

        BookedSlot slot = BookedSlot.of(command.startsAt(), offering.durations());
        availability.requireBookable(staffId, slot);

        CustomerId customerId = customers.upsertByPhone(command.customer());

        Appointment appointment = Appointment.pending(
            staffId, customerId, offering.id(), slot,
            offering.customerPrice(),          // frozen onto the row
            command.idempotencyKey(),
            clock.instant());

        // The EXCLUDE USING gist constraint is the anti-double-booking
        // guarantee; 23P01 surfaces as SlotUnavailableException -> 409.
        appointments.insertIfAbsent(appointment);

        // Outbox rows in the SAME transaction; the worker sends them later.
        notifications.enqueueAll(appointment.pendingNotifications());
        return appointment.id();
    }
}
```

No network call between `booking`, `catalog` and `scheduling`; the domain
holds the invariants; the database holds the exclusion guarantee; the
adapter — not the service — knows Hibernate; and nothing here logs, because
observability is an interceptor's job.

## Sibling skills

- `backend-srp` — one responsibility per class within these layers.
- `backend-naming` — suffix conventions per layer, and the table names.
- `backend-di` — how CDI wires ports to adapters, constructor injection only.
- `backend-exceptions` — the single `DomainException` base in
  `sharedkernel.error` and its RFC 7807 mapping.
- `contract-first` — the one OpenAPI document at the REST edge.
- `cdi-interceptors` — the only place cross-cutting AOP lives.
- `outbox-messaging` — the core → satellite path through `notifications`.
- `booking-integrity` — the exclusion constraint this layout protects, and
  the normative version of the service shown above.
- `multi-tenant-rls` — `TenantContext`, the connection-level GUC binding,
  and RLS across these layers.
- `backend-tests` — the ArchUnit rules that enforce this layout.
