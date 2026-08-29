---
name: backend-naming
description: Names Java types, packages, tables, columns and REST routes across the modular monolith. Use when creating an aggregate, port, adapter, application service, event or exception, choosing a package or a Flyway migration filename, naming a table, column, JSON property or query parameter, or reviewing a PR that reaches for an *Impl suffix, a singular table name, camelCase on the wire, an unversioned REST path, or a provider id in a method signature.
---

# backend-naming

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Class, interface, file and package naming across the modular monolith. Names
are in English, reveal the responsibility and the hexagonal layer they live
in, never a vague technical role.

## When to use

- Creating any new Java type (aggregate, value object, port, adapter, service,
  event, exception) in a bounded-context module.
- Picking a package for a new sub-domain, or a name for a Flyway migration.
- Naming a table, a column, a JSON property, a query parameter or a REST path.
- Reviewing a PR for naming consistency against the layered layout.

## The rules

1. **Package = `context.layer`.** Every type lives under
   `com.balaaca.<context>.<layer>` where `<context>` is one of the closed list
   of bounded contexts (`sharedkernel`, `identity`, `providers`, `catalog`,
   `scheduling`, `booking`, `billing`) and `<layer>` is one of `domain`,
   `application`, `ports`, `adapters`. The list is closed: a new context is a
   design decision, not a naming decision. The package name alone tells a
   reviewer whether the type may depend on infrastructure. Dependencies point
   inward: `adapters` -> `application`/`ports` -> `domain`; `domain` imports
   nothing outward and no framework at all.
2. **`shared-kernel` is the one context exempt from the four-layer rule.** It
   is split by concern, not by layer:
   `com.balaaca.sharedkernel.{money,time,logging,tenancy,error}`. `money` holds
   `Money`, `Currency`, `UnknownCurrencyException`; `time` the clock and range
   types; `logging` the MDC keys and masking helpers; `tenancy`
   `TenantContext`, the `ProviderMembershipResolver` port and
   `NoProviderMembershipException`; `error` the single `DomainException` base
   (see `backend-exceptions`). shared-kernel holds no business RULES, but it
   MAY declare cross-cutting ports — `ProviderMembershipResolver` is declared
   in `sharedkernel.tenancy` and implemented in `providers`. The root is
   `com.balaaca.sharedkernel`; `com.balaaca.shared.*` does not exist and any
   occurrence is a typo to fix.
3. **Domain aggregates and value objects: plain domain nouns, no suffix.**
   `Appointment`, `AvailabilityRule`, `AvailabilityOverride`,
   `AvailabilitySlot`, `ServiceOffering`, `Provider`, `ProviderStaff`,
   `Customer`, `Subscription`, `PlanEntitlements`, `Money`, `Currency`,
   `PhoneNumber`. They live in `<context>.domain/`. Never suffix them with
   `Entity`, `Dto`, `Model` or `Vo` — the domain type is the canonical name.
   The calendar-exception aggregate is `AvailabilityOverride`, never
   `AvailabilityException`: a non-throwable whose name ends in `Exception` is a
   trap for every reader and every `catch` block (rule 10). The catalogue
   aggregate is deliberately `ServiceOffering` and **never** `Service`:
   `Service` is already the application-bean suffix (rule 7) and is overloaded
   by the JAX-RS/Jakarta vocabulary, so `catalog.domain.Service` would collide
   on sight and `CreateServiceService` would be unreadable. A domain noun must
   never be a layer suffix.
4. **Ports: interfaces named for the capability, split by direction.**
   `<context>.ports.inbound` holds the use cases the module exposes = `*UseCase`
   (`BookAppointmentUseCase`, `CalculateSlotsUseCase`,
   `LookupServiceOfferingUseCase`, `CheckEntitlementUseCase`).
   `<context>.ports.outbound` holds what the core needs: persistence =
   `*Repository` (`AppointmentRepository`, `AvailabilityRuleRepository`),
   gateway = `*Port` (`SmsSenderPort`, `ObjectStoragePort`,
   `IdentityProviderPort`). The `inbound`/`outbound` split is not cosmetic —
   the ArchUnit rules are written against it (see `backend-architecture`). The
   port name describes intent, never the technology behind it —
   `SmsSenderPort`, never `TwilioPort`. A port lives in the context that OWNS
   the capability: quota checks are `billing`'s `CheckEntitlementUseCase`,
   called in-process by `catalog`, never a second entitlement port re-declared
   inside `catalog`; the catalogue read that `booking` needs is `catalog`'s
   `LookupServiceOfferingUseCase`. Port METHOD names state the semantics they
   guarantee: the appointment insert is `insertIfAbsent`, never `save` and
   never `insert`, because the implementation is
   `INSERT ... ON CONFLICT (provider_id, idempotency_key) DO NOTHING` followed
   by a `SELECT` (see `idempotency-concurrency`).
5. **Inbound REST adapters: `*Resource` (Quarkus/JAX-RS), versioned paths.**
   They implement the contract-first generated `*Api` interface and delegate
   straight into an application service. `AppointmentResource`,
   `ServiceOfferingResource`, `AvailabilityResource`. Every path carries a
   version segment and kebab-case plural nouns: `/v1/appointments`,
   `/v1/service-offerings`, `/v1/providers/{slug}/available-slots`. No business
   logic, no `Impl` suffix — see `contract-first`.
6. **The wire is snake_case, everywhere, with no exceptions.** Every JSON
   property and every query parameter is snake_case: `service_offering_id`,
   `starts_at`, `staff_id`, `amount_minor`, `next_cursor`. Java fields stay
   camelCase and the mapping is configured once per deployable; a camelCase
   property anywhere on the wire is a bug, not a style choice. Wire names
   mirror the column names of rule 9 so that a support engineer reading a
   payload and a DBA reading a row use the same vocabulary.
7. **Application use-case services: the inbound port is the interface, the
   bean is `*Service`.** Exactly two types per use case, never three:
   `BookAppointmentUseCase` (interface, `ports/inbound`) and
   `BookAppointmentService implements BookAppointmentUseCase` (CDI bean,
   `application/`). **No `*ServiceImpl`** — the port already IS the
   abstraction, so a second interface adds indirection without abstraction,
   and CDI proxies the class anyway (see `backend-di`). Orchestration only —
   money, slot and state-machine logic stays explicit in the domain, never in
   an interceptor (see `cdi-interceptors`).
8. **Adapters: named for the technology they bring, never `*Impl`.** An
   adapter's name must say WHICH implementation it is, because one day there
   will be a second: `AppointmentSqlRepository` (not
   `AppointmentRepositoryImpl`, and not `*PanacheRepository` for an adapter
   that uses no Panache), `TwilioSmsAdapter implements SmsSenderPort`
   (not `SmsSenderPortImpl`), `KeycloakIdentityAdapter`. `Impl` carries no
   information and blocks the next implementation from having a meaningful
   name. Sub-packages follow the direction and the edge:
   `adapters/inbound/{rest}` and `adapters/outbound/{persistence,gateway,
   messaging}`. There is no `grpc` sub-package and no `.proto` file anywhere —
   core modules talk through inbound ports (rule 4), and satellites talk HTTP
   to the business API.
9. **Persistence rows are not mapped types: there is no `*Entity` and no
   `*Mapper`.** ADR-0008 decides it - the schema's invariants are PostgreSQL
   features an ORM cannot express, so persistence adapters issue native SQL
   through the `EntityManager` and build domain types from the result tuple
   in place. A `*SqlRepository` is therefore the only class that knows a
   column exists, and the conversion lives in the method that reads the row.
   Reintroduce an `@Entity` only by superseding ADR-0008, never quietly for
   one table. Tenant-scoped rows are filtered by PostgreSQL RLS, whose GUC is
   bound by a connection-level hook rather than by any annotation (see
   `multi-tenant-rls`); that is a property of the schema, not of the name.
10. **Domain events: `*Event` semantics, past tense, in `<context>.domain/`
    (or a shared `events` sub-package).** `AppointmentBooked`,
    `AppointmentConfirmed`, `AppointmentCancelled`, `AppointmentRescheduled`.
    They are the payload written to the `notifications` table, which IS the
    transactional outbox (see `outbox-messaging`); name the fact that happened,
    not the command that caused it. Structured LOG event names are a separate,
    dotted-lowercase convention derived from the same facts:
    `appointment.booked`, `appointment.book.slot_unavailable` (see
    `pii-masking-logging`).
11. **Flyway migrations: `Vnnn__snake_case_description.sql`; tables are English
    snake_case PLURAL.** Double underscore after the version, lowercase
    snake_case, imperative description, version zero-padded to three digits so
    a directory listing sorts in migration order. Versions are globally
    distinct — the appointments DDL is `V014__create_appointments.sql` and
    booking-integrity owns it; every other skill quotes an excerpt and points
    there. The canonical tables are:
    `users`, `providers`, `provider_staff`, `provider_categories`,
    `service_offerings`, `availability_rules`, `availability_overrides`,
    `customers`, `appointments`, `notifications`, `subscriptions`,
    `audit_logs`. A foreign key is the referenced table's singular stem plus
    `_id`: `service_offering_id`, `provider_id`, `staff_id`, `customer_id`.
    Every tenant-scoped table carries `provider_id uuid NOT NULL`. A monetary
    amount is always the pair `<name>_amount_minor bigint` +
    `<name>_currency varchar(3) CHECK (<name>_currency ~ '^[A-Z]{3}$')` —
    `varchar(3)`, never `char(3)`, whose blank padding breaks exact-match
    comparison. The frozen booking price is exactly
    `customer_price_amount_minor` / `customer_price_currency`, read in Java
    through `customerPrice()` (see `money-currency`). One logical change per
    migration; never edit a migration already merged.
12. **Exceptions: `Invalid*Exception` (input/validation),
    `*NotFoundException` (lookup miss), `*ConflictException` (concurrency /
    state), or a domain-specific `*Exception`.** `InvalidPhoneNumberException`,
    `AppointmentNotFoundException`, `AppointmentConflictException`,
    `SlotUnavailableException`, `PlanLimitReachedException`,
    `NoProviderMembershipException`, `UnknownCurrencyException`. Always end in
    `Exception`, and — the converse, which matters more — **nothing that is not
    a `Throwable` may end in `Exception`**. All of them extend the single
    `com.balaaca.sharedkernel.error.DomainException`; a per-context base would
    leave `ExceptionMapper<DomainException>` unable to catch most of them (see
    `backend-exceptions`). The class name is internal vocabulary; the PUBLISHED
    `code` is separate and coarser — every lookup miss, cross-tenant read
    included, answers `RESOURCE_NOT_FOUND`.
13. **CDI interceptor bindings: `@<DomainNoun>` annotations, interceptor class
    `*Interceptor`.** `@TenantBound` + `TenantBoundInterceptor` (priority
    `Interceptor.Priority.PLATFORM_BEFORE + 10`), `@Idempotent` +
    `IdempotencyInterceptor`, `@RateLimited` + `RateLimitInterceptor`.
    Bindings are nouns/adjectives, never verbs (see `cdi-interceptors`).
14. **No tenant identifier in any name.** `provider_id` is ambient, read from
    `TenantContext`, so no type, method, field, DTO property, path segment or
    header is ever named after it. `findAppointments()`, never
    `findAppointmentsForProvider(UUID providerId)`; `AppointmentRepository`,
    never `ProviderScopedAppointmentRepository`. A name that mentions the
    tenant is a name that invites a caller to pass one (see
    `multi-tenant-rls`). The column `provider_id` of rule 11 is the schema's
    business, not the API's.

## Anti-patterns

- `AppointmentHelper`, `BookingManager`, `MoneyUtil` -> hide responsibility.
  Use a precise noun: `SlotCalculator`, `MoneyFormatter`, `AppointmentMapper`
  (rule 3/7). There is no `AppointmentPricer` either: nothing prices an
  appointment at runtime, the customer price is one amount frozen at booking.
- `AvailabilityException` for a closed day -> a value object whose name ends in
  `Exception`; it is `AvailabilityOverride`, table `availability_overrides`
  (rule 3/12).
- `IAppointmentRepository` (the `I` prefix) -> drop it, the interface is
  `AppointmentRepository` (rule 4).
- `appointments.save(appointment)` for the booking insert -> the port method is
  `insertIfAbsent`, whose name states the `ON CONFLICT DO NOTHING` semantics
  (rule 4).
- `AppointmentResourceImpl`, or a route `/appointments` with no version segment
  -> resources implement the generated `*Api`, take no `Impl` suffix, and every
  path starts `/v1/` (rule 5).
- `{"serviceOfferingId": "..."}` or `?nextCursor=` -> the wire is snake_case:
  `service_offering_id`, `next_cursor` (rule 6).
- `TwilioPort` -> the port is named for the capability (`SmsSenderPort`);
  Twilio belongs only in the adapter name `TwilioSmsAdapter` (rule 4/8).
- A `catalog.domain.Service` aggregate -> collides with the `*Service`
  application-bean suffix and with JAX-RS vocabulary; the catalogue aggregate
  is `ServiceOffering`, table `service_offerings`, route `/v1/service-offerings`
  (rule 3).
- `Appointment` annotated `@Entity` sitting in `domain/` -> a persistence
  concern leaked inward; split into domain `Appointment` + adapter
  `AppointmentEntity` (rule 3/9).
- `V7-create-appointment.sql`, `V7_createAppointment.sql`, or a table named
  `appointment` -> wrong separators/case and a singular table; it is
  `V014__create_appointments.sql` creating `appointments` (rule 11).
- `price_amount char(3)` currency columns, or a lone `price` numeric column ->
  the pair is `<name>_amount_minor bigint` + `<name>_currency varchar(3)`, and
  the booking price columns are `customer_price_*` (rule 11).
- `com.balaaca.shared.money.Money` -> the root is `com.balaaca.sharedkernel`
  (rule 2).
- `AppointmentCreatedEventDto` -> events are not DTOs; name it
  `AppointmentBooked` (rule 10).
- `bookAppointment(UUID providerId, BookAppointmentCommand command)` -> the
  tenant is ambient, not a parameter (rule 14).
- A class named `AppointmentLoggingListener` that actually applies the
  cancellation state transition -> name by responsibility; state-machine logic
  is explicit, not hidden behind a logging-sounding name (rule 7, and
  `cdi-interceptors`).

## Minimal correct example

```
com.balaaca.sharedkernel                      # no domain/application/ports/adapters
├── money/      Money, Currency, UnknownCurrencyException
├── time/       Clock provider, InstantRange
├── logging/    MdcKeys, LogMasking
├── tenancy/    TenantContext, ProviderMembershipResolver (port),
│               NoProviderMembershipException
└── error/      DomainException                 # the ONE base, extended by all

com.balaaca.booking
├── domain/
│   ├── Appointment.java                      # aggregate root
│   ├── AppointmentStatus.java                # PENDING/CONFIRMED/...
│   ├── Customer.java                         # the provider's address book
│   ├── AppointmentBooked.java                # *Event (past tense)
│   ├── SlotUnavailableException.java         # 23P01 -> 409 SLOT_UNAVAILABLE
│   ├── AppointmentConflictException.java     # lost update -> 409
│   └── AppointmentNotFoundException.java     # -> 404 RESOURCE_NOT_FOUND
├── ports/
│   ├── inbound/
│   │   ├── BookAppointmentUseCase.java       # exposed by this module
│   │   └── RescheduleAppointmentUseCase.java
│   └── outbound/
│       ├── AppointmentRepository.java        # insertIfAbsent(...), not save
│       ├── CustomerRepository.java
│       └── OutboxEventPublisher.java         # writes the notifications row
├── application/
│   └── BookAppointmentService.java           # @ApplicationScoped, implements the port
└── adapters/
    ├── inbound/rest/
    │   └── AppointmentResource.java          # implements generated AppointmentApi,
    │                                         # mounted at /v1/appointments
    └── outbound/persistence/
        └── AppointmentSqlRepository.java     # implements AppointmentRepository,
                                              # native SQL, no @Entity (ADR-0008)

# NOTE: no SmsSenderPort and no TwilioSmsAdapter here — `booking` never sends a
# message. It writes a row to the notifications table in the SAME transaction
# (rule 10) and the notification-worker deployable drains it. Nor is there an
# entitlement port: the quota check is billing's CheckEntitlementUseCase, and
# the catalogue read is catalog's LookupServiceOfferingUseCase, both called
# in-process (rule 4).

src/main/resources/db/migration/
└── V014__create_appointments.sql             # owned by booking-integrity;
                                              # no other skill re-numbers it
```

Column and wire vocabulary for one row, kept identical on both sides:

```sql
-- excerpt, illustrative of rule 11 only; the normative appointments DDL with
-- all its CHECK and EXCLUDE constraints lives in booking-integrity.
service_offering_id          uuid   NOT NULL,
starts_at                    timestamptz NOT NULL,
customer_price_amount_minor  bigint NOT NULL,
customer_price_currency      varchar(3) NOT NULL
    CHECK (customer_price_currency ~ '^[A-Z]{3}$'),
```

```json
{
  "service_offering_id": "…",
  "starts_at": "2026-09-01T09:00:00Z",
  "customer_price": { "amount_minor": 150000, "currency": "GNF" }
}
```

## Sibling skills

- `backend-architecture` — where each named type belongs across
  domain/application/ports/adapters, the inward dependency rule, and
  shared-kernel's exemption from it.
- `backend-srp` — a name must mirror one single responsibility.
- `backend-di` — constructor injection and final-field naming.
- `backend-exceptions` — the single `DomainException` base and the published
  code catalogue these class names map onto.
- `code-language` — identifiers, comments and messages are English (user-facing
  text is French first via i18n).
- `contract-first` — `*Resource` implements the OpenAPI-generated `*Api`, and
  the snake_case wire names are part of the published contract.
- `cdi-interceptors` — `@<Noun>` binding + `*Interceptor` naming and priority.
- `outbox-messaging` — `*Event` payloads written to the notifications table.
- `multi-tenant-rls` — why no name ever carries `provider_id`.
- `money-currency` — the `*_amount_minor` / `*_currency` column pair and
  `customerPrice()`.
- `booking-integrity` — `Appointment`, `SlotUnavailableException` and the
  `V014__create_appointments.sql` migration they map to.
