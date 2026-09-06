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
   of bounded contexts (`sharedkernel`, `platformkernel`, `identity`,
   `providers`, `catalog`, `scheduling`, `booking`, `billing`, plus the
   deployable `app`) and `<layer>` is one of `domain`,
   `application`, `ports`, `adapters`. The list is closed: a new context is a
   design decision, not a naming decision. The package name alone tells a
   reviewer whether the type may depend on infrastructure. Dependencies point
   inward: `adapters` -> `application`/`ports` -> `domain`; `domain` imports
   nothing outward and no framework at all.
2. **The two kernels are the contexts exempt from the four-layer rule.** Both
   are split by concern, not by layer:
   `com.balaaca.sharedkernel.{money,phone,error,ids}` and
   `com.balaaca.platformkernel.{tenancy,audit,media,ratelimit,time}`. `money`
   holds `Money`, `Currency`, `UnknownCurrencyException`,
   `CurrencyMismatchException`; `phone` holds `PhoneNumber`; `ids` the
   identifier records (`AppointmentId`, `StaffId`, `ServiceOfferingId`, ...);
   `error` the single `DomainException` base (see `backend-exceptions`);
   `tenancy` holds `TenantContext`, `ProviderId`, the
   `ProviderMembershipResolver` port and `NoProviderMembershipException`;
   `time` the `ClockProducer`. **Which kernel a concern lands in is decided by
   what a domain class may import**, not by taste: shared-kernel has zero
   framework imports, so importing `Money` never drags CDI, JWT and Agroal in
   behind it, and no `domain/` package may depend on platform-kernel at all.
   There is no `sharedkernel.logging`: `MdcKeys` and `LogMasking` were never
   written, no type by either name exists anywhere, and masking is applied at
   the boundaries instead (see `pii-masking-logging`). There is no
   `sharedkernel.time` range type either - the only one that exists is
   `scheduling.domain.InstantRange`, because scheduling was the only context
   that ever needed it and a kernel type nobody shares is a kernel type nobody
   should have moved. A kernel holds no business RULES, but it MAY declare
   cross-cutting ports - `ProviderMembershipResolver` is declared in
   `platformkernel.tenancy` and implemented in `providers`. The roots are
   `com.balaaca.sharedkernel` and `com.balaaca.platformkernel`;
   `com.balaaca.shared.*` does not exist and any occurrence is a typo to fix.
3. **Domain aggregates and value objects: plain domain nouns, no suffix.**
   `ServiceOffering`, `AvailabilityRule`, `AvailabilityOverride`,
   `AvailableSlot`, `OpeningWeek`, `BookingPolicy`, `BookedSlot`,
   `CustomerContact`, `ServiceAddress`, `ProviderStatus`, `SocialLink`,
   `Money`, `Currency`, `PhoneNumber`. They live in `<context>.domain/` (the
   last three in a kernel, rule 2). Never suffix them with
   `Entity`, `Dto`, `Model` or `Vo` - the domain type is the canonical name.
   **There is no `Appointment` class, and no `Provider`, `ProviderStaff`,
   `Customer`, `Subscription` or `PlanEntitlements` either.** None was deleted;
   none was ever written. Rule 9 is why: with native SQL and no ORM, a
   `*SqlRepository` reads a row straight into the record the port publishes, so
   a table earns a domain class only when it carries behaviour that has to live
   somewhere - `BookedSlot` computes the blocked window, `ServiceOffering`
   derives its own duration, and a row that only travels does not need a name
   of its own. `Subscription` and `PlanEntitlements` are a second case:
   `billing` holds a single `package-info.java` saying it is empty until the
   first quota is enforced. Do not code against any of them. The slot type is
   `AvailableSlot`, not `AvailabilitySlot`: it names what the caller may take,
   and there is deliberately no busy slot in the type at all.
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
   `LookupServiceOfferingUseCase`, `RegisterProviderUseCase`).
   `<context>.ports.outbound` holds what the core needs: persistence =
   `*Repository` (`AppointmentRepository`, `AvailabilityRepository`),
   gateway = `*Port` (`NotificationOutboxPort`). The `inbound`/`outbound` split is not cosmetic - the ArchUnit rules are written against it (see `backend-architecture`). The
   port name describes intent, never the technology behind it - the outbox port
   appends a row and cannot reach a network at all, and the satellite's sending
   port is `NotificationChannel`, never `TwilioPort`. There is no
   `SmsSenderPort`, `ObjectStoragePort` or `IdentityProviderPort`: the first two
   were never written under those names (image storage is `ImageStore` in
   `platformkernel.media`) and the third has nowhere to live, `identity` being
   empty. A port lives in the context that OWNS
   the capability: the catalogue read that `booking` needs is `catalog`'s
   `LookupServiceOfferingUseCase`. Port METHOD names state the semantics they
   guarantee: the appointment insert is `insertIfAbsent`, never `save` and
   never `insert`, because the implementation is
   `INSERT ... ON CONFLICT (provider_id, idempotency_key) DO NOTHING` followed
   by a `SELECT` (see `idempotency-concurrency`).
5. **REST resources: `*Resource` (Quarkus/JAX-RS), PLURAL, versioned paths.**
   They implement the contract-first generated `*Api` interface and delegate
   straight into an application service. `AppointmentsResource`,
   `ServiceOfferingsResource`, `CustomersResource`, `ScheduleResource`,
   `PublicBookingResource` - the noun is plural, like the path and the table.
   They all live in the deployable, `com.balaaca.app.rest`, and never inside a
   context: a path is served by exactly one JAX-RS resource, so a context that
   grew its own inbound adapter would be a second router for the same paths.
   The generated interface it implements is named after the contract's tag, not
   after the resource - `AppointmentsResource implements AgendaApi`,
   `ServiceOfferingsResource implements CatalogueApi` - and that is fine: the
   spec names the capability, the class names the route. Every path carries a
   version segment and kebab-case plural nouns: `/v1/appointments`,
   `/v1/service-offerings`, `/v1/providers/{slug}/available-slots`. No business
   logic, no `Impl` suffix - see `contract-first`.
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
   `application/`). **No `*ServiceImpl`** - the port already IS the
   abstraction, so a second interface adds indirection without abstraction,
   and CDI proxies the class anyway (see `backend-di`). Orchestration only - money, slot and state-machine logic stays explicit in the domain, never in
   an interceptor (see `cdi-interceptors`).
8. **Adapters: named for the technology they bring, never `*Impl`.** An
   adapter's name must say WHICH implementation it is, because one day there
   will be a second: `AppointmentSqlRepository` (not
   `AppointmentRepositoryImpl`, and not `*PanacheRepository` for an adapter
   that uses no Panache), `RedisAttemptLimiter implements AttemptLimiter` (not
   `AttemptLimiterImpl`), and in the notification-worker satellite
   `WhatsAppNotificationChannel` and `SmtpNotificationChannel` behind one
   `NotificationChannel` - which is exactly the case the rule is for, two
   implementations of one capability that `*Impl` could not have named. `Impl`
   carries no information and blocks the next implementation from having a
   meaningful name. Sub-packages follow the edge: `adapters/outbound/{persistence,
   ratelimit}` is the whole of it today. **There is no `adapters/inbound`
   anywhere**, and that is the architecture rather than an omission - every
   REST resource lives in the deployable (rule 5), so a context that grew an
   inbound adapter would be adding a router, not a package. There is no `grpc`
   sub-package and no `.proto` file either: core modules talk through inbound
   ports (rule 4), and satellites talk HTTP to the business API.
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
10. **Domain events: past tense, naming the fact rather than the command.**
    There are **no `*Event` classes** in the contexts - no `AppointmentBooked`,
    no `AppointmentConfirmed`, and none was removed: nothing subscribes to a
    domain event in-process, so a class per fact would have been a type with one
    writer and no reader. What is written to the `notifications` table, which IS
    the transactional outbox (see `outbox-messaging`), is a
    `booking.domain.PlannedNotification` carrying a `NotificationKind`
    (`BOOKING_CONFIRMATION`, `BOOKING_ACCEPTED`, `BOOKING_NOTICE`, `REMINDER`,
    `CANCELLATION`, `RESCHEDULE`, ...). The rule survives the absence of the
    class: a kind names what happened and who it is owed to, never the command
    that caused it. The one `*Event` in the tree is
    `platformkernel.audit.AuditEvent`, which is the trail's row and not a
    domain event. Structured LOG event names are a separate,
    dotted-lowercase convention derived from the same facts:
    `appointment.booked`, `appointment.book.slot_unavailable` (see
    `pii-masking-logging`).
11. **Flyway migrations: `Vnnn__snake_case_description.sql`; tables are English
    snake_case PLURAL.** Double underscore after the version, lowercase
    snake_case, imperative description, version zero-padded to three digits so
    a directory listing sorts in migration order. Versions are globally
    distinct - the appointments DDL is `V009__create_appointments.sql` and
    booking-integrity owns it; every other skill quotes an excerpt and points
    there. The first twelve migrations created twelve tables:
    `users`, `providers`, `provider_staff`, `provider_categories`,
    `service_offerings`, `availability_rules`, `availability_overrides`,
    `customers`, `appointments`, `notifications`, `subscriptions`,
    `audit_logs`. Nine more arrived later and obey the same rule -
    `localities`, `provider_category_families`, `provider_contestations`,
    `provider_links`, `provider_reports`, `provider_reviews`, `review_photos`,
    `service_photos`, `staff_service_offerings` - which is twenty-one, and the
    migration directory is the list. Do not treat any enumeration in a skill as
    the schema: a list that lags the directory is worse than no list, because
    it reads as closed. A foreign key is the referenced table's singular stem plus
    `_id`: `service_offering_id`, `provider_id`, `staff_id`, `customer_id`.
    Every tenant-scoped table carries `provider_id uuid NOT NULL`. A monetary
    amount is always the pair `<name>_amount_minor bigint` +
    `<name>_currency varchar(3) CHECK (<name>_currency ~ '^[A-Z]{3}$')` - `varchar(3)`, never `char(3)`, whose blank padding breaks exact-match
    comparison. The frozen booking price is exactly
    `customer_price_amount_minor` / `customer_price_currency`, read in Java
    into one `Money` the port publishes as `price()` - there is no
    `customerPrice()` accessor and there never was, because the column pair
    says whose price it is and the record already sits on an appointment (see
    `money-currency`). One logical change per
    migration; never edit a migration already merged.
12. **Exceptions: `Invalid*Exception` (input/validation),
    `*NotFoundException` (lookup miss), `*ConflictException` (concurrency /
    state), or a domain-specific `*Exception`.** `InvalidPhoneNumberException`,
    `AppointmentNotFoundException`, `InvalidStateTransitionException`,
    `SlotUnavailableException`, `SlugUnavailableException`,
    `NoProviderMembershipException`, `UnknownCurrencyException`. Two names this
    rule used to offer are not in the tree and never were:
    `AppointmentConflictException` (a state change that loses the race is
    `InvalidStateTransitionException`, thrown with the status the conditional
    UPDATE actually found) and `PlanLimitReachedException`
    (`billing` is empty, rule 3). Always end in
    `Exception`, and - the converse, which matters more - **nothing that is not
    a `Throwable` may end in `Exception`**. All of them extend the single
    `com.balaaca.sharedkernel.error.DomainException`; a per-context base would
    leave `ExceptionMapper<DomainException>` unable to catch most of them (see
    `backend-exceptions`). The class name is internal vocabulary; the PUBLISHED
    `code` is separate and coarser - every lookup miss, cross-tenant read
    included, answers `RESOURCE_NOT_FOUND`.
13. **CDI interceptor bindings: `@<DomainNoun>` annotations, interceptor class
    `*Interceptor`.** Bindings are nouns/adjectives, never verbs (see
    `cdi-interceptors`). **There is exactly one binding in this codebase**:
    `@TenantBound` + `TenantBoundInterceptor`, at
    `Interceptor.Priority.PLATFORM_BEFORE + 10`. `@Idempotent`,
    `IdempotencyInterceptor`, `@RateLimited` and `RateLimitInterceptor` do not
    exist and never did, and the reasons are worth keeping because somebody
    will propose each of them again. Rate limiting is a call, not an
    annotation: `AttemptLimiter` (with the `RedisAttemptLimiter` adapter, both
    in `platformkernel.ratelimit`) is invoked by name where a limit applies,
    because the decision needs the caller's own identifier and a `Retry-After`
    on the response, neither of which an interceptor can supply without the
    method telling it. Idempotency is done in SQL, by
    `AppointmentSqlRepository.insertIfAbsent` (rule 4), where the unique index
    is - an interceptor would be a read-then-write guard with a race in it.
    `TenantGucPoolInterceptor`, the only other `*Interceptor` in the tree, is an
    Agroal pool interceptor rather than a CDI one and carries no binding at all.
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
- `AppointmentsResourceImpl`, a singular `AppointmentResource`, or a route
  `/appointments` with no version segment -> resources implement the generated
  `*Api`, are plural, take no `Impl` suffix, and every path starts `/v1/`
  (rule 5).
- `{"serviceOfferingId": "..."}` or `?nextCursor=` -> the wire is snake_case:
  `service_offering_id`, `next_cursor` (rule 6).
- `TwilioPort`, `WhatsAppPort` -> the port is named for the capability
  (`NotificationChannel`); the vendor belongs only in the adapter name
  (`WhatsAppNotificationChannel`) (rule 4/8).
- A `catalog.domain.Service` aggregate -> collides with the `*Service`
  application-bean suffix and with JAX-RS vocabulary; the catalogue aggregate
  is `ServiceOffering`, table `service_offerings`, route `/v1/service-offerings`
  (rule 3).
- Any type annotated `@Entity`, in `domain/` or beside the adapter -> there is
  not one `@Entity` in the repository and ADR-0008 is why. The answer is not to
  split it into a domain type plus an `AppointmentEntity`: it is to delete the
  annotation and read the row into a record in the `*SqlRepository` method that
  queries it (rule 3/9).
- `V7-create-appointment.sql`, `V7_createAppointment.sql`, or a table named
  `appointment` -> wrong separators/case and a singular table; it is
  `V009__create_appointments.sql` creating `appointments` (rule 11).
- `price_amount char(3)` currency columns, or a lone `price` numeric column ->
  the pair is `<name>_amount_minor bigint` + `<name>_currency varchar(3)`, and
  the booking price columns are `customer_price_*` (rule 11).
- `com.balaaca.shared.money.Money` -> the root is `com.balaaca.sharedkernel`
  (rule 2).
- `AppointmentCreatedEventDto` -> events are not DTOs, and nothing here needs a
  class per fact anyway; what leaves the transaction is a `PlannedNotification`
  carrying a `NotificationKind` (rule 10).
- `bookAppointment(UUID providerId, BookAppointmentCommand command)` -> the
  tenant is ambient, not a parameter (rule 14).
- A class named `AppointmentLoggingListener` that actually applies the
  cancellation state transition -> name by responsibility; state-machine logic
  is explicit, not hidden behind a logging-sounding name (rule 7, and
  `cdi-interceptors`).

## Minimal correct example

```
com.balaaca.sharedkernel                      # framework free, so a domain type may import it
├── money/      Money, Currency, UnknownCurrencyException, CurrencyMismatchException
├── phone/      PhoneNumber
├── ids/        AppointmentId, StaffId, ServiceOfferingId, CustomerId, UserId, EntityId
└── error/      DomainException                 # the ONE base, extended by all

com.balaaca.platformkernel                    # CDI, JWT, Agroal - no domain/ may import it
├── tenancy/    TenantContext, ProviderId, ProviderMembershipResolver (port),
│               NoProviderMembershipException, TenantBound, TenantBoundInterceptor
├── audit/      AuditTrail, AuditEvent
├── media/      ImageStore, SanitisedImage
├── ratelimit/  AttemptLimiter, RedisAttemptLimiter
└── time/       ClockProducer

com.balaaca.booking
├── domain/
│   ├── AppointmentStatus.java                # PENDING/CONFIRMED/...
│   ├── BookedSlot.java                       # the window a booking occupies
│   ├── CustomerContact.java                  # who to reach, and how
│   ├── NotificationKind.java                 # BOOKING_CONFIRMATION, REMINDER, ...
│   ├── PlannedNotification.java              # one outbox row, as a value
│   └── BookingExceptions.java                # SlotUnavailableException & co, nested
├── ports/
│   ├── inbound/
│   │   ├── BookAppointmentUseCase.java       # exposed by this module
│   │   └── MoveAppointmentUseCase.java       # the reschedule; no *Reschedule* type
│   └── outbound/
│       ├── AppointmentRepository.java        # insertIfAbsent(...), not save
│       ├── AppointmentStateRepository.java   # cancel(...)/reschedule(...), each
│       │                                     # one conditional UPDATE, empty on a miss
│       ├── CustomerRepository.java
│       └── NotificationOutboxPort.java       # appends the notifications row
├── application/
│   └── BookAppointmentService.java           # @ApplicationScoped, implements the port
└── adapters/                                 # outbound only - see rule 8
    └── outbound/persistence/
        └── AppointmentSqlRepository.java     # implements AppointmentRepository,
                                              # native SQL, no @Entity (ADR-0008)

com.balaaca.app.rest                          # the deployable owns every route
└── AppointmentsResource.java                 # implements generated AgendaApi,
                                              # mounted at /v1/appointments

# NOTE: booking never sends a message. It writes a row to the notifications
# table in the SAME transaction and the notification-worker deployable drains
# it - the sending adapters (WhatsAppNotificationChannel, SmtpNotificationChannel
# behind NotificationChannel) live over there, not here. Nor is there an
# entitlement port: billing was never written, so no quota check exists to call.
# The catalogue read is catalog's LookupServiceOfferingUseCase, called
# in-process (rule 4).

src/main/resources/db/migration/
└── V009__create_appointments.sql             # owned by booking-integrity;
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

- `backend-architecture` - where each named type belongs across
  domain/application/ports/adapters, the inward dependency rule, and the two
  kernels' exemption from it.
- `backend-srp` - a name must mirror one single responsibility.
- `backend-di` - constructor injection and final-field naming.
- `backend-exceptions` - the single `DomainException` base and the published
  code catalogue these class names map onto.
- `code-language` - identifiers, comments and messages are English (user-facing
  text is French first via i18n).
- `contract-first` - `*Resource` implements the OpenAPI-generated `*Api`, and
  the snake_case wire names are part of the published contract.
- `cdi-interceptors` - `@<Noun>` binding + `*Interceptor` naming and priority.
- `outbox-messaging` - the `PlannedNotification` rows written to the
  notifications table.
- `multi-tenant-rls` - why no name ever carries `provider_id`.
- `money-currency` - the `*_amount_minor` / `*_currency` column pair and the
  `Money` it is read into.
- `booking-integrity` - `SlotUnavailableException` and the
  `V009__create_appointments.sql` migration these names map to.
