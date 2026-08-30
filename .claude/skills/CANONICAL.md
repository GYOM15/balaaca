# Balaaca - canonical reference

Every symbol below is **pinned**. A skill may cite this file; it must never
restate a signature, a DDL or a code in its own words. When a skill and this
file disagree, this file wins and the skill is a bug.

It exists because parallel authoring produced five names for one column and four
definitions of one table. Ambiguity in doctrine becomes drift in code.

Facts marked **verified** were executed against PostgreSQL 18.6, not reasoned
about.

---

## 1. Modules

Eight Maven modules. The list is closed.

| Module | Holds | Framework? |
|---|---|---|
| `shared-kernel` | `money`, `time`, `phone`, `error`, `pagination` | **no** - zero framework imports |
| `platform-kernel` | `tenancy`, `logging`, `ratelimit` | yes - CDI, MicroProfile JWT, Agroal |
| `identity` | `users`, the Keycloak subject link | yes |
| `providers` | providers, staff, categories - the tenant root | yes |
| `catalog` | service offerings | yes |
| `scheduling` | availability rules, overrides, slot calculation | yes |
| `booking` | appointments, customers, the state machine | yes |
| `billing` | subscriptions, plan entitlements | yes |

Satellites, separate deployables: `notification-worker`, `chatbot-service`.

**Why two kernels.** `shared-kernel` is what a domain class may import. Putting
`TenantContext` and the Agroal hook there would make every class that imports
`Money` drag CDI, JWT and Agroal behind it, and the ArchUnit "domain is
framework free" rule would still pass because it only inspects direct imports.
`platform-kernel` carries the framework-coupled cross-cutting machinery, and
**no `domain/` package may depend on it**.

Packages: `com.balaaca.<module>.<layer>`, layers
`domain | ports.inbound | ports.outbound | application | adapters.inbound.rest |
adapters.outbound.persistence`. The two kernels are exempt from the layer rule:
`com.balaaca.sharedkernel.{money,time,phone,error,pagination}` and
`com.balaaca.platformkernel.{tenancy,logging,ratelimit}`.

---

## 2. Migrations - order and ownership

One migration creates a table **and every constraint other migrations depend
on**, `UNIQUE (provider_id, id)` included. A composite foreign key whose target
lacks that UNIQUE fails with `42830` (**verified**), so a UNIQUE added later
than its first referencing migration breaks a fresh database.

| Version | Creates | Also declares |
|---|---|---|
| `V001__create_roles_and_extensions.sql` | roles `balaaca_migrator`, `balaaca_app`, `balaaca_resolver`, `balaaca_registrar`, `balaaca_notification_worker`; extensions `btree_gist`, `citext`, `pg_trgm` | `app_current_provider()` |
| `V002__create_users.sql` | `users` | |
| `V003__create_provider_categories.sql` | `provider_categories` | |
| `V004__create_providers.sql` | `providers` | |
| `V005__create_provider_staff.sql` | `provider_staff` | `UNIQUE (provider_id, id)`, the one-active-membership index |
| `V006__create_service_offerings.sql` | `service_offerings` | `UNIQUE (provider_id, id)`, `CHECK (duration_minutes > 0)` |
| `V007__create_customers.sql` | `customers` | `UNIQUE (provider_id, id)`, `UNIQUE (provider_id, phone_e164)` |
| `V008__create_availability.sql` | `availability_rules`, `availability_overrides` | |
| `V009__create_appointments.sql` | `appointments` | `UNIQUE (provider_id, id)`, the exclusion constraint |
| `V010__create_notifications.sql` | `notifications` | |
| `V011__create_subscriptions.sql` | `subscriptions` | |
| `V012__create_audit_logs.sql` | `audit_logs` | |
| `V013__enable_row_level_security.sql` | policies, grants, resolution functions | |
| `V014__enable_provider_registration.sql` | registration policies and grants, `app_register_provider()` | the signup seam - see 4.4 |
| `V015__enforce_membership_and_isolation.sql` | `app_resolve_membership()`, status filters, RLS on `users` and `audit_logs`, maintenance policies | see 4.5 |
| `V016__seed_provider_categories.sql` | the curated trade taxonomy | `provider_categories` was empty in production |
| `V017__narrow_two_policies.sql` | `providers_public_read` restricted to unbound connections; the registrar may add an owner only to a provider with no staff | |
| `V018__record_the_audit_trail.sql` | `app_resolve_membership()` returns the account; `audit_logs` accepts a platform row | |
| `V019__let_a_customer_reach_their_booking.sql` | `appointments.public_reference`, `app_resolve_booking_provider()` | a third tenant source - see 4.6 |
| `V020__answer_the_caller_before_the_slug.sql` | `app_register_provider()` refuses a registered account before arbitrating the handle | closes a slug oracle |
| `V021__let_an_employee_be_invited.sql` | `provider_staff.invitation_token`, `app_accept_staff_invitation()`, `app_describe_membership()` | the fourth tenant source - see 4.7 |

Tables are plural snake_case. `staff_id` references `provider_staff`; the
shortened stem is the one deliberate exception to "foreign key = singular stem
plus `_id`".

---

## 3. The appointments table - normative DDL

**Verified**: this exact DDL executes, and rejects every hole listed under it.

```sql
CREATE TABLE appointments (
    id                  uuid PRIMARY KEY,
    provider_id         uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    staff_id            uuid NOT NULL,
    service_offering_id uuid NOT NULL,
    customer_id         uuid NOT NULL,
    booked_by_user_id   uuid REFERENCES users(id),

    starts_at    timestamptz NOT NULL,
    ends_at      timestamptz NOT NULL,
    -- Frozen at booking: changing the offering never moves an existing booking.
    buffer_before_minutes int NOT NULL CHECK (buffer_before_minutes >= 0),
    buffer_after_minutes  int NOT NULL CHECK (buffer_after_minutes  >= 0),
    blocked_from  timestamptz NOT NULL,
    blocked_until timestamptz NOT NULL,

    status varchar(20) NOT NULL DEFAULT 'PENDING'
           CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
    cancelled_at   timestamptz,
    cancelled_by   varchar(20) CHECK (cancelled_by IN ('CUSTOMER','PROVIDER','SYSTEM')),

    -- Frozen snapshot of what the customer owes.
    service_name                varchar(120) NOT NULL,
    customer_price_amount_minor bigint  NOT NULL CHECK (customer_price_amount_minor >= 0),
    customer_price_currency     varchar(3) NOT NULL CHECK (customer_price_currency ~ '^[A-Z]{3}$'),

    idempotency_key          varchar(80),
    idempotency_request_hash varchar(64),

    version    bigint      NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    blocked_range tstzrange GENERATED ALWAYS AS
        (tstzrange(blocked_from, blocked_until, '[)')) STORED,

    CONSTRAINT ck_appointments_window         CHECK (ends_at > starts_at),
    CONSTRAINT ck_appointments_block_nonempty CHECK (blocked_until > blocked_from),
    CONSTRAINT ck_appointments_block_covers   CHECK (blocked_from  <= starts_at
                                                 AND blocked_until >= ends_at),
    CONSTRAINT ck_appointments_block_derived  CHECK (
        blocked_from  = starts_at - make_interval(mins => buffer_before_minutes)
    AND blocked_until = ends_at   + make_interval(mins => buffer_after_minutes)),
    CONSTRAINT ck_appointments_cancel_shape CHECK (
        status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)),
    CONSTRAINT ck_appointments_idempotency_pair CHECK (
        (idempotency_key IS NULL) = (idempotency_request_hash IS NULL)),

    FOREIGN KEY (provider_id, staff_id)            REFERENCES provider_staff    (provider_id, id),
    FOREIGN KEY (provider_id, service_offering_id) REFERENCES service_offerings (provider_id, id),
    FOREIGN KEY (provider_id, customer_id)         REFERENCES customers         (provider_id, id),
    CONSTRAINT uq_appointments_provider_id UNIQUE (provider_id, id)
);

ALTER TABLE appointments ADD CONSTRAINT no_double_booking
    EXCLUDE USING gist (provider_id WITH =, staff_id WITH =, blocked_range WITH &&)
    WHERE (status IN ('PENDING','CONFIRMED'));

CREATE UNIQUE INDEX uq_appointments_idempotency
    ON appointments (provider_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
```

Holes this closes, each **verified**:

| Attack | Without the CHECK | With it |
|---|---|---|
| `blocked_from = blocked_until` | the range is EMPTY, `&&` is false against everything, unlimited bookings at one instant | `23514` |
| Blocked window narrowed to one minute for an hour-long service | 59 minutes unprotected, constraint satisfied | `23514` |
| `blocked_from` inconsistent with the declared buffer | derivation unenforced | `23514` |
| Offering with `duration_minutes = 0` | produces the empty range above | `23514` |

`make_interval` may **not** appear in a generated column (`42P17`, **verified**)
but **may** appear in a `CHECK` (**verified**). That asymmetry is why
`blocked_from`/`blocked_until` are ordinary columns and only `blocked_range` is
generated.

---

## 4. Tenant resolution - the two sources

The tenant is **never** taken from a request field, a header, or a JWT claim. It
has exactly two server-side sources, and **verified** SQL for each.

### 4.1 Authenticated staff - from the Keycloak subject

`provider_staff` is tenant-scoped, so resolving membership from it is
circular: the GUC is not bound yet, `FORCE ROW LEVEL SECURITY` binds the owner
too, and a plain read returns zero rows - **nobody could ever authenticate**.
A `SECURITY DEFINER` function owned by a role with its own narrow policy is what
breaks the circle, and it returns exactly one uuid.

```sql
CREATE POLICY provider_staff_resolution ON provider_staff
    FOR SELECT TO balaaca_resolver USING (true);

CREATE FUNCTION app_resolve_membership(p_subject varchar)
RETURNS TABLE (provider_id uuid, staff_id uuid, user_id uuid, staff_role varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT ps.provider_id FROM provider_staff ps JOIN users u ON u.id = ps.user_id
    WHERE u.keycloak_user_id = p_subject AND ps.status = 'ACTIVE' $$;
ALTER FUNCTION app_resolve_membership(varchar) OWNER TO balaaca_resolver;
REVOKE ALL ON FUNCTION app_resolve_provider(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_provider(varchar) TO balaaca_app;
```

**Verified**: `balaaca_app` reading `provider_staff` directly with no GUC sees
zero rows; the function still resolves; and calling it cannot widen a read.

### 4.2 Public booking - from the published slug

A customer is not staff, so membership resolution yields nothing and a booking
would 403. The public write path therefore identifies the tenant by the
provider's **public slug** - the very string meant to be shared on WhatsApp.

```
POST /v1/providers/{slug}/appointments
```

```sql
CREATE FUNCTION app_resolve_published_provider(p_slug varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT id FROM providers WHERE slug = p_slug AND published $$;
ALTER FUNCTION app_resolve_published_provider(varchar) OWNER TO balaaca_resolver;
```

**Verified**: an unpublished provider resolves to `NULL`, so the endpoint 404s.

This is not the IDOR the no-tenant-in-request rule exists to prevent: the slug
grants no privilege beyond what the public page already offers. The rule stands
unchanged for every authenticated provider-scoped route, which carries **no**
tenant identifier at all. What the public path may do is strictly bounded:
create a `PENDING` appointment, and read the public projections. It may never
list appointments or read customers.

### 4.3 Binding the GUC

The interceptor fills `TenantContext`. The **database** GUC is bound by a
connection-level hook, because `@TenantBound` at `PLATFORM_BEFORE + 10` runs
outside the transaction Quarkus opens at `PLATFORM_BEFORE + 200`, so a
`@Transactional(MANDATORY)` binder can never be called from it.

`TenantGucPoolInterceptor` (`platformkernel.tenancy`, an `AgroalPoolInterceptor`)
issues, as the first statement on the acquired connection:

```sql
SELECT set_config('app.provider_id', ?, true)
```

It **must** guard on request-context activity - `Arc.container().requestContext()
.isActive()` - and bind the empty string when inactive. A `@RequestScoped` proxy
accessed outside an active context throws `ContextNotActiveException`; without
the guard, Flyway at startup, the readiness probe and the worker drain all fail.

Every RLS policy predicate, without exception:

```sql
provider_id = nullif(current_setting('app.provider_id', true), '')::uuid
```

**Verified**: `current_setting('x')` without `missing_ok` raises `42704`, and
`''::uuid` raises `22P02` - a 500 where a 404 belongs. Only this form degrades
to `NULL` and filters every row.

### 4.4 Signing up - creating a tenant before one exists

`providers_tenant` carries `WITH CHECK (id = app_current_provider())`, which
with nothing bound is `NULL` and admits nothing. So a salon that registers in
Keycloak holds a valid token, reaches every route, and is refused by all of
them: no role can perform the INSERT that would make it resolvable.

The same circularity 4.1 broke for reading, broken the same way - a
`SECURITY DEFINER` function, owned by its **own** role so that "what can bring
a provider into existence" has exactly one answer.

```sql
CREATE FUNCTION app_register_provider(...) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$ ... $$;
ALTER FUNCTION app_register_provider(...) OWNER TO balaaca_registrar;

CREATE POLICY providers_registration ON providers
    FOR INSERT TO balaaca_registrar
    WITH CHECK (NOT published AND status = 'PENDING');
CREATE POLICY provider_staff_registration ON provider_staff
    FOR INSERT TO balaaca_registrar WITH CHECK (role = 'OWNER');
```

Three things are load-bearing and none is stylistic.

- **The provider row is inserted BEFORE the staff row.** A caller who passes an
  existing provider's id then fails on `providers_pkey` before any membership
  is written. Reversed, the function is a salon takeover: write an `OWNER` row
  into someone else's provider and the resolver hands you their tenant on the
  next request. **Verified** on PostgreSQL 18.6.
- **The registrar can only ever create a dormant provider.** The policy, not
  the function body, is what guarantees registration never puts a page on the
  public booking path.
- **Uniqueness is translated to SQLSTATEs inside the function.** Every unique
  violation is `23505`, so telling three constraints apart in Java would mean
  depending on the driver's exception type in a module that has no other reason
  to. `providers_slug_key` -> `Z0001`, `uq_provider_staff_one_active_membership`
  and `users_keycloak_user_id_key` -> `Z0002`; anything else is re-raised, so a
  primary-key collision stays the fault it is.

`POST /v1/providers` is therefore `@Authenticated` and **not** `@TenantBound`,
the only route on the platform that is. It declares no scope: a scope says what
a caller may do inside their own provider, and the caller has none yet.

### 4.5 What revocation revokes, and who may do what

Three things the schema described and nothing enforced, all fixed in V015 and
all verified against PostgreSQL 18.6.

- **Suspension suspended nothing.** Resolution filtered on the staff row's
  status alone. An account marked `DELETED` still resolved on the next request,
  defeating the interceptor's one design premise; a `SUSPENDED` provider kept
  its dashboard AND stayed publicly bookable. `users.status`, `providers.status`
  and the `providers_public_read` policy now all say so.
- **There was no OWNER/STAFF line.** `provider_staff.role` was written at
  registration and read by nothing, so every member with an account could
  unpublish the storefront and re-price the catalogue. Resolution returns the
  role; `TenantContext.requireOwner` refuses in the service layer, which is what
  the published contract always claimed happened. Owner-only: the public
  profile, and composing the team. A member writes their own hours and closures
  and nobody else's.
- **`users` and `audit_logs` had no RLS** while `balaaca_app` held full DML.
  Both are FORCE now, `users` scoped through `provider_staff` and `audit_logs`
  on `provider_id`.

A fourth, found while writing it: only `notifications` had a **maintenance
policy**. Every other tenant table was FORCE RLS with no policy naming
`balaaca_migrator`, so a data-fixing migration matched zero rows and reported
success. Verified. All ten now have one.

Scopes are **optional** client scopes, not default. A default scope is in every
token for every user, which made every `@RolesAllowed` unable to refuse anybody.
They still are not the privilege boundary - the database is.

### 4.6 Customer access - from the booking reference

A customer has no account and will not be made to have one, so the third and
last source of a tenant is a **capability**: a 256-bit reference minted at
booking, handed back once, and carried in the confirmation message.

```
GET  /v1/bookings/{reference}
POST /v1/bookings/{reference}/cancellation
```

```sql
CREATE FUNCTION app_resolve_booking_provider(p_reference varchar) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT a.provider_id FROM appointments a JOIN providers p ON p.id = a.provider_id
    WHERE a.public_reference = p_reference AND p.status IN ('PENDING','ACTIVE') $$;
```

Three things distinguish it from the slug:

- **It is not the appointment's id.** The id is on the provider's agenda, in the
  audit trail and in log lines; a capability has to be a value whose only job is
  to be one, so that widening where the id is used never widens what it can do.
- **It does not require the provider to be published.** A salon that took a
  booking and then unpublished still owes that customer an answer. A suspended
  or closed business is another matter and resolves to nothing.
- **A replay returns the stored reference**, never a fresh mint - otherwise a
  retried booking leaves the customer holding a key to nothing.

`cancellation_deadline_minutes` is enforced on this path and only on this path.
It binds the customer, not the provider: a salon cancelling its own appointment
is managing its diary. The column existed from V004 and was enforced nowhere,
which is the same as not having had it.

### 4.7 Joining a team - from an invitation code

The STAFF role V015 drew was **unreachable in production**:
`provider_staff.user_id` was written by exactly one thing, `app_register_provider`,
for the owner. No employee had ever had an account outside a test fixture - the
third time this shape appeared, after "nothing creates a provider" and "nothing
creates a second staff member".

```
POST /v1/staff/{id}/invitation        owner mints a code for a chair
POST /v1/invitations/{code}/acceptance  the invitee redeems it
```

A capability, like a booking reference: 256 bits, seven days, spent by the first
redemption. Nothing is sent - the owner already has a way to reach their own
employee.

`app_accept_staff_invitation` is owned by **balaaca_registrar**, the same role as
signing up, because it is the same privilege: writing a membership before one
exists. Two things constrain it beyond the function body:

```sql
CREATE POLICY provider_staff_invitation ON provider_staff
    FOR UPDATE TO balaaca_registrar
    USING      (user_id IS NULL AND status = 'ACTIVE' AND role = 'STAFF')
    WITH CHECK (user_id IS NOT NULL AND status = 'ACTIVE' AND role = 'STAFF');
```

`USING` admits only an unclaimed STAFF row, so **an owner's seat cannot be taken
over by an invitation** even if the function were rewritten wrongly, and a
claimed one cannot be reassigned. `WITH CHECK` demands the result carry an
account, so the policy cannot be used to unbind a member either.

The code is spent in the same UPDATE that claims it, so two people reading the
same message cannot both take the seat. Unknown, expired, already redeemed and
at a suspended business are one `404`.

---

## 4.8 A column arrives with its reader

Almost every defect found in this project has had one shape, and none was a
logic bug: **the schema declares something and no code names it.**

`auto_confirm` DEFAULTed to true and had no reader, so every salon confirmed by
hand. `cancellation_deadline_minutes` was enforced nowhere. `users.status` and
`providers.status` were consulted nowhere, so suspension revoked nothing.
`audit_logs` had no Java at all. `provider_staff.role` was written and read by
nobody, so every employee held full control. `provider_categories` had eighteen
rows and no route. `providers.country_code` existed while the booking edge
passed a hardcoded `"GN"`. And three times a table nothing wrote to made a whole
capability unreachable: no provider, no second staff member, no employee
account.

The cause is upstream. Twelve migrations were written from a specification
before most of the code existed, so the schema described the whole product while
the code implemented a slice, and **nothing measured the distance**.

Two rules follow.

1. **A column arrives in the same change as its reader.** A migration that adds
   a column no code names is not a smaller change, it is a promise with no
   delivery date.
2. **`SchemaCoverageTest` measures the distance**, because rule 1 is advice and
   advice is not enforcement. Every declared column is named by some code or
   waived in `schema-coverage-waivers.txt` with a reason, and every table the
   application role may INSERT into has an INSERT somewhere. It runs in a
   quarter of a second and it found `country_code` on its first execution.

---

## 5. Ports - exact signatures

```java
// platformkernel.tenancy - implemented in providers
public interface ProviderMembershipResolver {
    ProviderId requireFor(String keycloakSubject);   // throws NoProviderMembershipException
    ProviderId requirePublished(ProviderSlug slug);  // throws ProviderNotFoundException
}

// catalog.ports.inbound
public interface LookupServiceOfferingUseCase {
    ServiceOffering require(ServiceOfferingId id);   // throws ServiceOfferingNotFoundException
}

// scheduling.ports.inbound
public interface CalculateSlotsUseCase {
    List<AvailableSlot> bookable(SlotQuery query);
}

// billing.ports.inbound
public interface CheckEntitlementUseCase {
    void require(Entitlement entitlement);           // throws PlanLimitReachedException
}

// booking.ports.inbound
public interface BookAppointmentUseCase {
    AppointmentId book(BookAppointmentCommand command);
}

// booking.ports.outbound
public interface AppointmentRepository {
    InsertOutcome insertIfAbsent(Appointment appointment);
    int compareAndAdvance(AppointmentId id, AppointmentStatus expected,
                          AppointmentStatus next, long version);
    Map<StaffId, List<InstantRange>> busyRanges(Set<StaffId> staff, InstantRange window);
}

public record InsertOutcome(Appointment appointment, boolean replayed) {}
```

`insertIfAbsent` is `INSERT ... ON CONFLICT (provider_id, idempotency_key) DO
NOTHING` followed by a `SELECT`. An explicit conflict target arbitrates only that
index, so a `23P01` exclusion violation still surfaces. `23505` on the
idempotency index is a **replay**, never an error.

---

## 6. Exceptions

One base, in `com.balaaca.sharedkernel.error`, framework-free.

```java
public abstract class DomainException extends RuntimeException {
    private final String code;                 // published, SCREAMING_SNAKE_CASE
    private final int status;                  // HTTP status the mapper emits
    private final Map<String, Object> details; // audit only, never sent to the client

    protected DomainException(String code, int status, String message) {
        this(code, status, message, Map.of(), null);
    }
    protected DomainException(String code, int status, String message,
                              Map<String, Object> details) {
        this(code, status, message, details, null);
    }
    protected DomainException(String code, int status, String message,
                              Map<String, Object> details, Throwable cause) { ... }
}
```

| Exception | Status | Code |
|---|---|---|
| `SlotUnavailableException(Instant startsAt)` | 409 | `SLOT_UNAVAILABLE` |
| `SlotOutsideAvailabilityException(Instant)` | 422 | `SLOT_OUTSIDE_AVAILABILITY` |
| `AppointmentConflictException(AppointmentId)` | 409 | `APPOINTMENT_CONFLICT` |
| `InvalidStateTransitionException(from, to)` | 409 | `INVALID_STATE_TRANSITION` |
| `CancellationDeadlinePassedException(Instant)` | 422 | `CANCELLATION_DEADLINE_PASSED` |
| `NoEligibleStaffException(Instant)` | 409 | `SLOT_UNAVAILABLE` |
| `IdempotencyKeyReusedException(String key)` | 422 | `IDEMPOTENCY_KEY_REUSED` |
| `PlanLimitReachedException(Entitlement)` | 403 | `PLAN_LIMIT_REACHED` |
| `CurrencyMismatchException(a, b)` | 422 | `CURRENCY_MISMATCH` |
| `NoProviderMembershipException(String subject)` | 403 | `FORBIDDEN` |
| `ResourceNotFoundException(String kind, String id)` | 404 | `RESOURCE_NOT_FOUND` |
| `CrossTenantAccessException(String kind, String id)` | 404 | `RESOURCE_NOT_FOUND` |

`SlotUnavailableException`'s message never names the staff member: on the
any-staff path the server chose them, so naming them discloses who is busy to a
caller who never asked. The staff id goes in `details`, which the audit log reads
and the client never sees.

A cross-tenant read and a genuine miss are **byte-identical**: same 404, same
`RESOURCE_NOT_FOUND`. `PlanLimitReachedException` is 403, never 402 - there is no
payment path to require.

---

## 7. Published error codes - closed catalogue

`RESOURCE_NOT_FOUND` · `VALIDATION_FAILED` · `UNAUTHENTICATED` · `FORBIDDEN` ·
`RATE_LIMITED` · `SLOT_UNAVAILABLE` · `SLOT_OUTSIDE_AVAILABILITY` ·
`APPOINTMENT_CONFLICT` · `INVALID_STATE_TRANSITION` ·
`CANCELLATION_DEADLINE_PASSED` · `IDEMPOTENCY_KEY_REQUIRED` ·
`IDEMPOTENCY_KEY_REUSED` · `PLAN_LIMIT_REACHED` · `CURRENCY_MISMATCH` ·
`INTERNAL_ERROR` · `SLUG_UNAVAILABLE` · `ALREADY_REGISTERED`

No other code exists. Adding one is an OpenAPI change. Renaming one is forbidden.

The last two were added with the signup path (4.4), and only because neither was
expressible. A taken public handle and an account that already runs a business
are both `409`, and a client that cannot tell them apart cannot say which: one
is fixed by choosing another handle, the other is not fixed by anything the
caller can type. Collapsing them into `VALIDATION_FAILED` would have been the
cheaper change and the wrong one.

---

## 8. Commands and wire shapes

```java
public record BookAppointmentCommand(
        ServiceOfferingId  serviceOfferingId,
        Optional<StaffId>  staffId,        // empty = the server chooses
        Instant            startsAt,
        CustomerContact    customer,       // fullName + PhoneNumber + optional email
        IdempotencyRequest idempotency) {} // key + requestHash

public record IdempotencyRequest(String key, String requestHash) {}
```

`requestHash` is SHA-256 of the **client's** canonicalised body only -
`service_offering_id`, `starts_at`, `staff_id` including its absence, and the
customer contact. Never over server-resolved values: hashing the chosen staff id
would make a legitimate retry produce a different hash and fail as a reuse.

Wire format is snake_case throughout. `staff_id` is **omitted** to let the server
choose; it is never sent as `null`.

```yaml
BookAppointmentRequest:
  required: [service_offering_id, starts_at, customer]
  properties:
    service_offering_id: { type: string, format: uuid }
    staff_id:            { type: string, format: uuid }   # omit for any staff
    starts_at:           { type: string, format: date-time }
    customer:            { $ref: '#/components/schemas/CustomerContact' }
```

Collections: `{ "data": [...], "next_cursor": string|null }`, `?cursor=&limit=`.

---

## 9. Interceptor order

| Binding | Class | Priority |
|---|---|---|
| tracing | `TracingInterceptor` | `PLATFORM_BEFORE + 5` |
| `@TenantBound` | `TenantBoundInterceptor` | `PLATFORM_BEFORE + 10` |
| `@RateLimited` | `RateLimitInterceptor` | `PLATFORM_BEFORE + 20` |
| `@Transactional` | Quarkus | `PLATFORM_BEFORE + 200` |
| `@Audited` | `AuditLoggingInterceptor` | `PLATFORM_BEFORE + 210` |

Audit sits inside the transaction so an audit row commits with the change it
describes. The GUC hook is **not** an interceptor (section 4.3).

---

## 10. Verified PostgreSQL behaviour

Executed against 18.6. Do not re-derive these; cite them.

| Behaviour | Result |
|---|---|
| `tstzrange(a, b, '[)')` in a `GENERATED ... STORED` column | allowed - it is `IMMUTABLE` |
| `timestamptz - make_interval(...)` in a generated column | `42P17`, not `IMMUTABLE` |
| the same expression in a `CHECK` | allowed |
| empty range (`a = b`) against `EXCLUDE ... &&` | **never conflicts** - the hole `ck_*_block_nonempty` closes |
| composite FK with no matching `UNIQUE` on the target | `42830` at migration time |
| `current_setting('x')` when unset | `42704` |
| `current_setting('x', true)` when unset | empty string |
| `''::uuid` | `22P02` |
| `SET LOCAL` via `set_config(..., true)` | dropped at commit - safe with pooling |
| the same, called OUTSIDE a transaction | scoped to that one statement, gone by the next |
| `ON CONFLICT (cols)` against a PARTIAL unique index | `42P10` unless the index's `WHERE` predicate is repeated |
| 10 concurrent inserts on one slot | 1 row wins - always |
| the losers' SQLSTATE under contention | **non-deterministic**: `23P01` or `40P01` deadlock, see below |
| `SECURITY DEFINER` under `FORCE RLS` | runs under the owner's policies - the resolution path |
| app role attempting `DISABLE ROW LEVEL SECURITY` | `must be owner of table` |
| app role attempting to grant itself `BYPASSRLS` | `permission denied to alter role` |


---

## 11. Contention on the exclusion constraint

Measured against the migrated schema on PostgreSQL 18.6, N sessions racing for
one slot:

| Concurrent | Winners | `23P01` exclusion | `40P01` deadlock |
|---|---|---|---|
| 2 | 1 | 0 | 1 |
| 3 | 1 | 2 | 0 |
| 5 | 1 | 0 | 4 |
| 10 | 1 | 0 | 9 |

**The invariant never broke: exactly one booking, every time.** What varies is
the error the loser sees. Each transaction inserts its tuple, then waits on the
conflicting transaction; two or more such waits form a cycle and PostgreSQL
breaks it as a deadlock instead of reporting the exclusion violation.

This is not a defect to fix. It is a behaviour the booking path must handle,
and it is invisible to any single-threaded test:

- **`23P01`** - the slot is definitively taken. Map to `409 SLOT_UNAVAILABLE`.
- **`40P01`** - a transient serialisation failure that says **nothing** about
  whether the slot is free. **Retry the whole transaction**, bounded (three
  attempts, small jitter). A retry that then hits `23P01` is a real conflict and
  becomes the 409; exhausted retries are `503` with `Retry-After`, because the
  system is contended, not the slot.

Treating a deadlock as "slot taken" turns away customers from a free slot.
Leaving it unmapped returns an unhandled 500 on every busy provider. Both are
production failures that only appear under load.


---

## 12. Two traps this schema sets, both paid for once

### The session variable does not outlive its statement

`set_config('app.provider_id', ?, true)` is `SET LOCAL`. Outside a transaction
there is no transaction to be local to, so it applies to that statement and is
gone by the next one. **Verified**: the same query returns 0 rows outside a
transaction and 2 rows inside one.

Every read that RLS filters must therefore run inside a transaction, including
reads that change nothing. A read-only lookup left non-transactional does not
fail loudly - it returns an empty result, which reads as "this tenant has no
data" and produces a confidently wrong answer. In this codebase that turned
every server-chosen booking into a spurious "no eligible staff".

The rule: **if a method touches a tenant table, it is `@Transactional`, even if
it only reads.**

### A second policy makes RLS stop identifying one row

Policies are OR'd. `providers` carries the tenant policy plus a public-read
policy, so the hub can list published providers with no tenant bound. With a
tenant bound, a bare `SELECT ... FROM providers` therefore returns my provider
**and** every published one.

Any query meaning "the current tenant's row" must say so:
`WHERE id = app_current_provider()`. RLS gives singularity only where the tenant
policy is the sole policy - which is true of every other table here, and not of
this one.

### ON CONFLICT cannot see a partial index by itself

The idempotency index is partial, because a key is optional:

```sql
CREATE UNIQUE INDEX uq_appointments_idempotency
    ON appointments (provider_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
```

`ON CONFLICT (provider_id, idempotency_key)` then fails with `42P10`, "there is
no unique or exclusion constraint matching the ON CONFLICT specification"
(**verified**). The inference arbiter has to be told the predicate too:

```sql
ON CONFLICT (provider_id, idempotency_key) WHERE idempotency_key IS NOT NULL
DO NOTHING
```

---

## 13. Types at the boundary

Identifiers are distinct types, not raw uuids:
`ServiceOfferingId`, `StaffId`, `CustomerId`, `AppointmentId` in
`com.balaaca.sharedkernel.ids`, each a record implementing `EntityId`. Passing a
customer id where a staff id belongs stops being a runtime mystery and becomes a
compile error.

The core speaks domain types only. A command carries `PhoneNumber`, not a
string; `BookingSource`, not `"PUBLIC"`. An inbound adapter converts once, at
the edge, and everything inward is valid by construction - which is what lets
application services carry no defensive checks.

**When a mapper class earns its place.** Not by field count. By whether the
translation carries rules:

| Translation | Where it belongs |
|---|---|
| Copying one field out (`AppointmentId` to a response) | inline at the call site |
| Parsing, normalising, defaulting, unit or enum conversion | a named, container-free mapper |
| Twelve fields copied one-to-one | neither - ask why two identical shapes exist |

A second test matters more than size: **how many inbound adapters need the same
translation?** REST, the chatbot and the dashboard will all have to produce a
`BookAppointmentCommand`. Inlined in the first resource, the second copies it
and the third gets the phone region wrong.
