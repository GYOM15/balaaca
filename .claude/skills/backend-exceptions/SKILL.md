---
name: backend-exceptions
description: Owns the single DomainException base and the RFC 7807 error mapping. Use when throwing a new domain exception, extending the ExceptionMapper, choosing an HTTP status or a published error code, translating SQLSTATE 23P01 or 23505, deciding what a cross-tenant read returns, or reviewing a PR where a stack trace, an SQL string, a PostgreSQL constraint name, a 402 for a plan limit, a per-resource 404 code or a per-context exception base reaches the client.
---

# backend-exceptions

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Two-tier exception model: domain exceptions live inside each context's
`domain/` (business-rule violations, expressed in ubiquitous language),
application/adapter failures live at the edges, and a single Quarkus
`ExceptionMapper` translates every exception into an RFC 7807
`application/problem+json` response. Slot, tenant, state-machine, entitlement,
concurrency and money violations get their own explicit typed exceptions.

## When to use

- Throwing an exception from any layer of a bounded-context module
  (`identity`, `providers`, `catalog`, `scheduling`, `booking`, `billing`).
- Adding a new error path that an API consumer or the notification worker must
  be able to tell apart.
- Choosing the status and the published `code` for a new failure.
- Reviewing a PR where a raw stack trace, an SQL string, a PostgreSQL
  constraint name, or a Hibernate `ConstraintViolationException` reaches the
  client.

## The rules

1. **There is exactly ONE `DomainException` base, in
   `com.balaaca.sharedkernel.error`.** Every context extends that same class:
   `booking`, `scheduling`, `catalog`, `providers`, `identity`, `billing` and
   shared-kernel itself. This is not a style preference - the single mapper is
   registered as `ExceptionMapper<DomainException>`, and JAX-RS resolves a
   mapper by the exception's type hierarchy. Seven per-context bases would give
   one mapper that catches one of them and six families surfacing as raw 500s
   with a stack trace, which is precisely the failure mode rule 4 exists to
   prevent. `DomainException` carries a `code` and an English message and
   depends on nothing outside `java.*`.
2. **Domain exceptions live in the context's `domain/` layer.** They are
   thrown by aggregates, domain services and value objects when a business
   invariant is violated, and they depend on nothing outside the domain (no
   JAX-RS, no Hibernate, no `Response`). Examples: `SlotUnavailableException`,
   `SlotOutsideAvailabilityException`, `InvalidStateTransitionException`,
   `AppointmentConflictException`, `CrossTenantAccessException`.
3. **Application/adapter failures live at the edge, not in the domain.**
   An outbound adapter wraps its technology's error into a named application
   exception (`NotificationChannelUnavailableException`) - never lets a
   `WebApplicationException`, a `PersistenceException` or an SDK type propagate
   inward. The domain depends on ports, so it can never catch a framework type
   (see `backend-architecture`). The one tenancy failure that crosses this line
   is `NoProviderMembershipException` (`sharedkernel.tenancy`): the
   authenticated subject has no `ACTIVE` row in `provider_staff`, so no tenant
   can be resolved. It extends `DomainException` like everything else, and it
   is the ONLY name for that condition - `TenantNotResolvedException`,
   `TenantResolutionFailedException` and `MissingTenantClaimException` do not
   exist.
4. **Exactly one place maps exceptions to HTTP: a `@Provider`
   `ExceptionMapper`.** No REST resource builds its own error body, and no
   `try/catch` in a resource returns a `Response`. The mapper (one per
   deployable, in the boundary/adapter layer) turns each exception into a
   `ProblemDetail` (RFC 7807) with `type`, `title`, `status`, `detail`,
   `instance` and a stable SCREAMING_SNAKE_CASE `code`. Register it via
   `@Provider` so Quarkus REST picks it up. Codes are published contract: once
   shipped, a code is never renamed and never reused for another meaning (see
   `platform-api` for the normative catalogue and `contract-first` for how it
   is published).
5. **Never leak internals to the client.** No stack trace, no SQL, no class
   name, no Hibernate/JDBC message, and in particular **no PostgreSQL
   constraint name** in the `detail` - `appointments_no_overlap` tells an
   attacker how exclusion is enforced and is not a message a human can act on.
   Log the cause server-side with the correlation id; return a sanitized,
   stable message. A 500 must carry a generic `detail` and a correlation id the
   client can quote to support - the real cause stays in the logs.
6. **Slot, tenant, state, concurrency, entitlement and money violations are
   always explicit typed exceptions - never a generic
   `IllegalStateException`.** These are the invariants the mandatory test
   suites assert on, so they must be nameable. The list that must exist:
   - `SlotUnavailableException` - the database exclusion constraint rejected
     the insert (SQLSTATE `23P01`); another appointment already holds that
     staff member's blocked range. It is thrown for a slot the CLIENT named. On
     the "any available staff" path the server chose the staff member, so the
     application retries the whole unit of work against the next eligible
     candidate in a NEW transaction and only surfaces this exception when every
     candidate conflicts (see `booking-integrity`).
   - `SlotOutsideAvailabilityException` - the requested start falls outside the
     provider's availability rules, inside an `AvailabilityOverride` that
     closes the day, or in the past. The past is outside every window; it needs
     no code of its own.
   - `AppointmentConflictException` - a conditional `UPDATE ... WHERE id = :id
     AND status IN (...) AND version = :v` affected zero rows: someone else
     moved the appointment first. Distinct from `SlotUnavailableException`,
     which is about the calendar, not about a lost update.
   - `CrossTenantAccessException` - a `TenantContext` mismatch; **maps to 404**
     with the same code and body a genuine miss returns, so the response is no
     existence oracle for another provider's rows.
   - `NoProviderMembershipException` - the caller is authenticated but is staff
     at no provider, so no tenant exists to scope the request to.
   - `InvalidStateTransitionException` - an appointment state-machine move that
     is not legal from the current status.
   - `CancellationDeadlinePassedException` - cancellation attempted after the
     provider's booking-policy deadline.
   - `PlanLimitReachedException` - a `PlanEntitlements` quota (max services,
     max staff) would be exceeded.
   - `IdempotencyKeyReusedException` - an `Idempotency-Key` replayed with a
     different request fingerprint (see `idempotency-concurrency`).
   - `CurrencyMismatchException` - arithmetic across two currencies.
   - `UnknownCurrencyException` - `Currency.of` was handed a code the platform
     does not support; a validation failure, not an `IllegalArgumentException`.
7. **Map to the right status, deterministically.** The mapping lives in the
   mapper, in one registry - reviewers check it there. This table is the
   complete set; `platform-api` publishes the same codes as a closed enum:

   | Exception                             | Status | Code                          |
   |---------------------------------------|--------|-------------------------------|
   | `SlotUnavailableException`            | 409    | `SLOT_UNAVAILABLE`            |
   | `AppointmentConflictException`        | 409    | `APPOINTMENT_CONFLICT`        |
   | `InvalidStateTransitionException`     | 409    | `INVALID_STATE_TRANSITION`    |
   | `SlotOutsideAvailabilityException`    | 422    | `SLOT_OUTSIDE_AVAILABILITY`   |
   | `CancellationDeadlinePassedException` | 422    | `CANCELLATION_DEADLINE_PASSED`|
   | `IdempotencyKeyReusedException`       | 422    | `IDEMPOTENCY_KEY_REUSED`      |
   | `CurrencyMismatchException`           | 422    | `CURRENCY_MISMATCH`           |
   | `PlanLimitReachedException`           | 403    | `PLAN_LIMIT_REACHED`          |
   | `NoProviderMembershipException`       | 403    | `FORBIDDEN`                   |
   | `CrossTenantAccessException`          | 404    | `RESOURCE_NOT_FOUND`          |
   | any lookup miss (`*NotFoundException`)| 404    | `RESOURCE_NOT_FOUND`          |
   | validation / parse / unknown currency | 400    | `VALIDATION_FAILED`           |
   | missing `Idempotency-Key`             | 400    | `IDEMPOTENCY_KEY_REQUIRED`    |
   | unauthenticated                       | 401    | `UNAUTHENTICATED`             |
   | not permitted                         | 403    | `FORBIDDEN`                   |
   | rate limit exceeded                   | 429    | `RATE_LIMITED`                |

   Two entries in that table are decisions, not conventions.
   **`PlanLimitReachedException` is 403, never 402.** `402 Payment Required`
   asserts a payment path, and Balaaca has no payments, no PSP and no ledger; a
   402 would tell an integrator to look for a payment link that does not exist.
   The quota is an authorisation limit on the current plan, which is what 403
   means. **The 404 has exactly ONE code, `RESOURCE_NOT_FOUND`**, and the
   response for a cross-tenant read must be byte-identical to the response for
   a genuine miss: same status, same code, same title, same `detail`. There is
   no `TENANT_FORBIDDEN`, and no per-resource `APPOINTMENT_NOT_FOUND`,
   `PROVIDER_NOT_FOUND` or `SERVICE_NOT_FOUND` - a distinct code, a distinct
   title, or even a distinct sentence leaks exactly what the 404 is hiding. An
   idempotency replay with a MATCHING fingerprint is **not** an error - return
   the original result (2xx), see `idempotency-concurrency`.
8. **Exceptions carry minimal, structured-enough context.** A message
   (English, per `code-language`) plus optionally a `Throwable cause` and the
   few identifiers needed for the `code`/problem fields. No builders, no bags
   of fields - richer data belongs in the problem response or the audit log,
   not the exception. Never put a customer phone number, name or email in an
   exception message: it ends up in a log line. `provider_id` and the
   correlation id are operational identifiers and are logged raw; identifiers
   that resolve to a natural person (`customer_id`, `user_id`,
   `appointment_id`) are masked at the log boundary only (see
   `pii-masking-logging`).
9. **Never use exceptions for expected control flow.** A port returns
   `Optional<T>` for "not found"; the application decides whether absence is an
   error. Do not `catch` a `NotFoundException` to branch. Reserve exceptions
   for genuinely exceptional, invariant-breaking situations. Three carve-outs,
   each deliberate:
   - `23P01` is translated at the persistence adapter. The conflict is
     genuinely detected by the database, and the exclusion constraint is the
     only authority on it, so catching the SQLSTATE is the design.
   - `23505` on the idempotency index is a REPLAY, never an error. It is not
     even reached on the normal path: the insert is `ON CONFLICT
     (provider_id, idempotency_key) DO NOTHING` followed by a `SELECT`, and the
     explicit conflict target arbitrates only that index so a `23P01` still
     surfaces.
   - A conditional `UPDATE` that affects zero rows does not raise anything, so
     the affected-row count must be CHECKED and turned into
     `AppointmentConflictException`. The same is true under RLS: a write that
     targets another tenant's row affects zero rows, it does not raise. Code
     that waits for an exception there silently does nothing.
10. **The interceptor traces, the mapper responds.** The audit/tracing CDI
    interceptor (see `cdi-interceptors`) records the failure and the
    correlation id; the `ExceptionMapper` produces the client body. Both run
    for the same throw - keep logging out of the mapper beyond a single
    sanitized line, keep response-building out of the domain, and keep
    `Logger` fields out of application services entirely (see `backend-srp`).

## Anti-patterns

- A `DomainException` base per context (`booking.domain.DomainException`,
  `catalog.domain.DomainException`, …) → rule 1. The single
  `ExceptionMapper<DomainException>` then catches one family and the other six
  become raw 500s in production.
- `throw new RuntimeException("slot already taken")` → rule 2+6. Name it
  `SlotUnavailableException` so it can be mapped and tested.
- A REST resource with `try { ... } catch (Exception e) { return
  Response.serverError().entity(e.getMessage()).build(); }` → rule 4+5.
  Let the mapper decide; never echo `e.getMessage()`.
- A `PSQLException` with SQLSTATE `23P01` bubbling to a raw 500 → rule 3+7.
  Catch it in the persistence adapter and translate it to
  `SlotUnavailableException` → 409 `SLOT_UNAVAILABLE`.
- `"detail": "conflicting key value violates exclusion constraint
  \"appointments_no_overlap\""` → rule 5; that string is a schema disclosure,
  not an error message.
- The domain layer importing `jakarta.ws.rs.*` or `Response` to throw an
  HTTP error → rule 2+3; dependencies point inward, the domain has no web.
- A quota breach mapped to `402 PAYMENT_REQUIRED` → rule 7; there is no
  payment path in this product, it is `403 PLAN_LIMIT_REACHED`.
- A quota breach surfacing as a generic `IllegalStateException` → rule 6.
- A cross-tenant read returning 403, a `TENANT_FORBIDDEN` code, or a 404 whose
  code is `APPOINTMENT_NOT_FOUND` while a genuine miss says `RESOURCE_NOT_FOUND`
  → rule 7; both answers must be byte-identical.
- `SlotAlreadyBookedException`, `SlotConflictException`,
  `SLOT_ALREADY_BOOKED`, `APPOINTMENT_SLOT_TAKEN` → rule 6; the one name is
  `SlotUnavailableException` and the one code is `SLOT_UNAVAILABLE`.
- `TenantNotResolvedException` / `MissingTenantClaimException` → rule 3; the
  one name is `NoProviderMembershipException`.
- An `Idempotency-Key` replayed with a different body returning the FIRST
  appointment and a 2xx → rule 6+7; compare the request fingerprint and answer
  422 `IDEMPOTENCY_KEY_REUSED`.
- `try { update(...) } catch (Exception e) { … }` around a cross-tenant or
  optimistic update, expecting a throw → rule 9; it affects zero rows in
  silence. Check the count.
- Renaming `SLOT_UNAVAILABLE` to `APPOINTMENT_CONFLICT` in a later release →
  rule 4; published codes are frozen, and `APPOINTMENT_CONFLICT` already means
  something else.

## Minimal correct example

The one base, in `com.balaaca.sharedkernel.error`, framework-free:

```java
public abstract class DomainException extends RuntimeException {

    private final String code;

    protected DomainException(String code, String message) {
        this(code, message, null);
    }

    protected DomainException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
```

A context's exception (inside `booking/domain/`) extends THAT class, not a
local one:

```java
public final class SlotUnavailableException extends DomainException {
    public SlotUnavailableException(StaffId staffId, Instant startsAt) {
        super("SLOT_UNAVAILABLE",
              "The requested slot is no longer available for staff "
                  + staffId + " at " + startsAt);
    }
}
```

The persistence adapter translates the database's verdict - the exclusion
constraint is the authority, the application never pre-checks with a lock and
never takes one:

```java
@ApplicationScoped
public class AppointmentSqlRepository implements AppointmentRepository {

    private static final String EXCLUSION_VIOLATION = "23P01";

    /**
     * INSERT ... ON CONFLICT (provider_id, idempotency_key) DO NOTHING,
     * then SELECT. The explicit conflict target arbitrates only the
     * idempotency index, so an overlap still raises 23P01.
     */
    @Override
    public InsertOutcome insertIfAbsent(Appointment appointment) {
        try {
            return insertOnConflictDoNothingThenSelect(appointment);
        } catch (PersistenceException ex) {
            if (EXCLUSION_VIOLATION.equals(sqlStateOf(ex))) {
                throw new SlotUnavailableException(
                        appointment.staffId(), appointment.startsAt());
            }
            throw ex;
        }
    }
}
```

The single mapper (in the boundary/adapter layer), the only place that knows
HTTP:

```java
@Provider
public class DomainExceptionMapper implements ExceptionMapper<DomainException> {

    private static final Logger LOG =
            Logger.getLogger(DomainExceptionMapper.class);

    @Override
    public Response toResponse(DomainException ex) {
        // one registry, deterministic; CrossTenantAccessException and every
        // *NotFoundException resolve to the SAME 404 RESOURCE_NOT_FOUND entry
        StatusMapping mapping = StatusRegistry.forCode(ex.code());
        LOG.warnf("domain.violation code=%s correlation_id=%s",
                  ex.code(), CorrelationContext.current());
        ProblemDetail problem = ProblemDetail.builder()
            .type("https://errors.balaaca.com/" + mapping.slug())
            .title(mapping.title())
            .status(mapping.status())
            .detail(messages.get(mapping.messageKey(), locale))  // no internals
            .code(mapping.publicCode())
            .instance(CorrelationContext.current())
            .build();
        return Response.status(mapping.status())
            .type("application/problem+json")
            .entity(problem)
            .build();
    }
}
```

The tracing interceptor recorded the failure independently; the domain never
touched `Response`.

## Sibling skills

- `backend-architecture` - dependencies point inward; the domain has no
  web/JAX-RS types, so domain exceptions cannot know about HTTP.
- `backend-naming` - the `*Exception` suffix rule, the prohibition on
  non-throwables ending in `Exception`, and where `DomainException` lives.
- `platform-api` - the normative, closed catalogue of published error codes
  this table must agree with.
- `contract-first` - the RFC 7807 problem shapes are part of the OpenAPI
  document and never change once published.
- `cdi-interceptors` - the audit/tracing interceptor logs the failure; the
  mapper only responds.
- `pii-masking-logging` - the sanitized log line carries `provider_id` and the
  correlation id raw, and masks identifiers that resolve to a person.
- `booking-integrity`, `money-currency`, `idempotency-concurrency`,
  `multi-tenant-rls`, `temporal-modelling` - each owns the invariant whose
  violation is a specific typed exception here.
- `backend-srp` - why a conditional UPDATE's affected-row count, not a
  `catch`, is what raises `AppointmentConflictException`.
- `code-language` - exception messages and `code`s are English; the customer
  message is resolved from the i18n catalogue at the edge.
