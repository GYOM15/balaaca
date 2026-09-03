---
name: booking-integrity
description: Guards the anti-double-booking invariant. Use when creating, rescheduling, confirming or cancelling an Appointment, writing the appointments migration or its EXCLUDE USING gist constraint, resolving "any available staff", or reviewing a PR that reaches for a Redis lock, an advisory lock, a SELECT FOR UPDATE, or a coalesce(staff_id, provider_id) resource key.
---

# booking-integrity

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Two customers must never hold the same slot. This is Balaaca's single most
critical invariant, and it is guaranteed by PostgreSQL - an `EXCLUDE USING
gist` constraint on the `appointments` table - not by application code. Every
other rule here exists to keep that constraint the *only* thing standing
between a race and a double booking: a concrete `staff_id`, a slot recomputed
server-side, a range that can never be empty, one transaction, and a `23P01`
mapped to `409`.

This skill owns `V014__create_appointments.sql`. That migration is the one
normative appointments DDL in the pack; every other skill shows an excerpt of
it and points back here.

## When to use

- Creating, rescheduling, cancelling, or confirming an `Appointment`.
- Writing or reviewing `V014__create_appointments.sql`, its exclusion
  constraint, its `blocked_range` column, its `CHECK` constraints, or the
  appointment state machine.
- Resolving "any available staff" to a concrete `ProviderStaff`, or touching
  `provider_staff` creation when a `Provider` is created.
- Computing an `AvailabilitySlot` from `availability_rules` /
  `availability_overrides` and a `ServiceOffering` duration and buffers.
- Reviewing a PR that reaches for a Redis lock, an advisory lock, a
  `SELECT … FOR UPDATE`, a pre-`SELECT` overlap check, or a
  `coalesce(staff_id, provider_id)` resource key.
- Reviewing any booking change that ships without both mandatory concurrency
  tests.

## The rules

1. **The database guarantees non-overlap; application code never does.** The
   `appointments` table carries an `EXCLUDE USING gist` constraint over
   `(provider_id, staff_id, blocked_range)`, partial on the active statuses.
   It holds for every code path - REST, chatbot, an admin back-office, a
   Flyway data fix, a `psql` session - for any number of application
   instances, at the default `READ COMMITTED` isolation, with no lock
   discipline for anyone to forget. A pre-`SELECT` "is this slot free?" is a
   *user-experience* check that produces a friendly message; it is never the
   guarantee, because both racers can pass it.
2. **`blocked_from` and `blocked_until` are ordinary columns computed by the
   application; only `blocked_range` is generated.** A generated column may
   not call `make_interval`: PostgreSQL 18.6 rejects the migration with
   `42P17`, because `timestamptz` ± `interval` is `STABLE`, not `IMMUTABLE`.
   `tstzrange(a, b, '[)')` over two *stored* columns is immutable, so the
   range itself is legal:
   `blocked_range tstzrange GENERATED ALWAYS AS (tstzrange(blocked_from,
   blocked_until, '[)')) STORED`. Half-open `[)`, so an appointment ending at
   10:00 and one starting at 10:00 do not conflict. Any DDL that generates the
   range directly from `make_interval` does not run; it is not a style
   preference, it is a broken migration.
3. **Every emptiness and coverage condition is stated as its own `CHECK`;
   transitive protection does not count.** Verified on PostgreSQL 18.6: with
   `blocked_from = blocked_until` the generated `tstzrange` is **empty**, `&&`
   is false against everything, and unlimited appointments insert at the same
   instant with the constraint reporting success. So `appointments` carries,
   explicitly:
   `CONSTRAINT ck_appointments_window CHECK (ends_at > starts_at)`,
   `CONSTRAINT ck_appointments_block_nonempty CHECK (blocked_until >
   blocked_from)`, and
   `CONSTRAINT ck_appointments_block_covers CHECK (blocked_from <= starts_at
   AND blocked_until >= ends_at)`.
   `service_offerings` carries `CHECK (duration_minutes > 0)` so a
   zero-length service cannot reach the booking path at all. Writing only the
   `service_offerings` check and reasoning "therefore the range is never
   empty" is exactly the argument that lets a data fix or a future column
   default reopen the hole.
4. **The buffers are frozen into columns, and a `CHECK` pins the
   derivation.** `buffer_before_minutes` and `buffer_after_minutes` are
   copied from the `ServiceOffering` at booking time,
   `NOT NULL CHECK (… >= 0)`. A `CHECK` constraint *may* call `make_interval` - verified - even though a generated column may not, and that asymmetry is
   the whole reason for this shape. So
   `CONSTRAINT ck_appointments_block_derived CHECK (blocked_from = starts_at -
   make_interval(mins => buffer_before_minutes) AND blocked_until = ends_at +
   make_interval(mins => buffer_after_minutes))`
   makes the database, not a code comment, the thing that guarantees the
   application computed the block window correctly. A later price or buffer
   change on the service never moves an existing block window.
5. **`btree_gist` is installed before the constraint, and every parent of a
   composite foreign key declares the matching `UNIQUE`.** `uuid =` has no
   GiST operator class without `CREATE EXTENSION IF NOT EXISTS btree_gist`.
   And a `FOREIGN KEY (provider_id, staff_id) REFERENCES provider_staff
   (provider_id, id)` fails on a fresh database with `42830` - "there is no
   unique constraint matching the given keys" - unless `provider_staff`
   declares `UNIQUE (provider_id, id)`. The same applies to
   `service_offerings`, `customers`, and to `appointments` itself, which
   `notifications` references the same way. Verified; a primary key on `id`
   alone does not satisfy the reference.
6. **`staff_id` is `NOT NULL`, always.** Creating a `Provider` creates an
   `OWNER` row in `provider_staff` in the same transaction, so a solo barber
   still books against a real staff member. There is no "unassigned"
   appointment and no nullable resource column.
7. **`coalesce(staff_id, provider_id)` as a resource key is a known bug, not
   a shortcut.** With a nullable `staff_id` and a coalesced key, an
   unassigned booking keys on `provider_id` while a named booking keys on
   `staff_id`; the two values differ, the ranges never compare, and the
   constraint silently lets both rows in. The provider is then double-booked
   with the database reporting success. Rules 6 and 8 exist precisely so this
   key is never needed.
8. **"Any available staff" is resolved server-side to one concrete staff
   member before the insert.** The customer may ask for no particular person;
   the booking service produces an *ordered list* of qualified, available
   `ProviderStaff` - least-loaded that day first, ties broken by id - and
   books against the head of it. The ordering is deterministic so it is
   testable, and it is a hint, not a guarantee: correctness still comes from
   the constraint.
9. **A conflict on a client-named staff member is a `409`; a conflict on a
   server-chosen one is retried.** These are different situations and
   collapsing them is a real product bug. Every concurrent racer computes the
   same least-loaded candidate, so five simultaneous "any available staff"
   requests at a salon with five free chairs produce one success and four
   spurious `409`s while four chairs sit empty. Therefore: if the client named
   the staff member, `23P01` maps to `409 SLOT_UNAVAILABLE` immediately - the
   customer asked for that person and that person is busy. If the *server*
   chose, catch `23P01`, discard the failed transaction, and retry the whole
   unit of work in a **new** transaction against the next eligible candidate,
   bounded by the number of eligible staff. Only when every candidate has
   conflicted is the answer `409`. The retry loop lives outside any
   transaction; a rollback-only transaction cannot be reused.
10. **The slot is always recomputed server-side from the service's own
    duration and buffers.** Read the `ServiceOffering` inside the
    transaction, take `duration_minutes`, `buffer_before_minutes`,
    `buffer_after_minutes` from it, and derive `ends_at`, `blocked_from`, and
    `blocked_until` from `starts_at`. Any `ends_at`, `duration_minutes`, or
    `blocked_range` in the request body is ignored - accepting one lets a
    client shrink its own footprint and book inside someone else's
    appointment. The request carries `starts_at`, `service_offering_id`, and
    optionally `staff_id`; nothing else about time.
11. **The slot calculator and the constraint must agree on buffers, or the
    API advertises slots the database then rejects.** `busy` is the **stored**
    `blocked_range` of each `PENDING`/`CONFIRMED` appointment. That range
    already contains *that* appointment's own frozen buffers and is **never
    widened again**. The calculator widens only the **candidate** slot, by the
    **requested** service's buffers, and tests the widened candidate against
    `busy`. Widening both sides double-counts and hides free time; widening
    neither advertises slots that fail with `23P01` at insert. The busy lookup
    returns `Map<StaffId, List<InstantRange>>` so the any-staff path in rule 9
    can see every candidate in one read.
12. **One transaction, in this order, with no network I/O inside it.** Load
    the provider (timezone, booking policy) and the service; resolve or accept
    the staff member; recompute the slot; validate it against
    `availability_rules` and `availability_overrides` and the booking policy
    (lead time, horizon); upsert the `Customer` on the provider's
    `(provider_id, phone_e164)` key; insert the appointment; insert the
    `notifications` outbox rows; write the `audit_logs` row. No SMS, no push,
    no HTTP call, no Redis round-trip for business data happens between
    `BEGIN` and `COMMIT` - the notification rows are the transactional
    handoff, drained later by the `notification-worker`.
13. **Availability validation and the exclusion constraint answer different
    questions.** Availability says "the provider is open and this service can
    start then"; the constraint says "nobody else already has it". Passing
    availability is never a reason to skip the constraint, and a constraint
    violation is never reported as "closed".
14. **The insert is `INSERT … ON CONFLICT (provider_id, idempotency_key) DO
    NOTHING` followed by a `SELECT`, and the key carries a request
    fingerprint.** The port method is `insertIfAbsent`; there is no `save` and
    no `insert`. An affected-row count of `1` means created; `0` means the key
    already exists, which is a **replay, never an error**. On a replay,
    compare the stored `idempotency_request_hash` with the current request's
    hash: equal returns the stored appointment and the original `201` body;
    different is `422 IDEMPOTENCY_KEY_REUSED`, because the same key with a
    different body previously returned someone else's appointment and reported
    success. The conflict target is **explicit** - naming
    `(provider_id, idempotency_key)` arbitrates only that index, so a `23P01`
    exclusion violation still surfaces as an error and rule 9 can act on it.
    Never `persist` + `flush` + catch for this path: it conflates the two
    SQLSTATEs and leaves the transaction rollback-only on a mere replay. The
    key lives for the life of the appointment row; there is no 24-hour expiry,
    because nothing implements one.
15. **SQLSTATE `23P01` maps to `409` with a stable code.** The repository
    inspects the `SQLState` of the cause chain and - doing no further database
    work, because the transaction is already rollback-only - throws
    `SlotUnavailableException`, which extends the single `DomainException`
    base in `com.balaaca.sharedkernel.error` and carries `SLOT_UNAVAILABLE`.
    `platform-api`'s one `ExceptionMapper<DomainException>` renders RFC 7807
    `application/problem+json` with `code: "SLOT_UNAVAILABLE"`, status `409`.
    The code is published and never renamed. The message never names the other
    customer, the other appointment, or the staff member's other client.
16. **No Redis lock, no advisory lock, no `SELECT … FOR UPDATE` for slot
    exclusion. Ever.** A Redis lock is not part of the database transaction:
    it can expire mid-insert, it is lost when Redis restarts, and it is
    unenforceable for any writer that does not participate. An advisory lock
    or a `FOR UPDATE` on some parent row makes correctness depend on every
    future code path taking the same lock in the same order - one omission
    and the invariant is gone, silently. The constraint needs no cooperation
    from anybody. (`FOR UPDATE` on genuinely hot rows for *other* reasons
    remains a normal tool; see `idempotency-concurrency`.)
17. **`provider_id` is in the exclusion key for selectivity and defence in
    depth - not to prevent a cross-tenant leak, which cannot happen anyway.**
    Be accurate about this, because the wrong reason teaches the wrong
    lesson. `staff_id` is a globally unique `uuid` bound to exactly one
    provider by the composite foreign key of rule 5, so `staff_id WITH =`
    alone can never match a row belonging to another tenant. Keep
    `provider_id WITH =` regardless: it is the leading key of the GiST index
    and it makes the tenant scope of the constraint self-evident to anyone
    reading the DDL. The separate and genuinely important observation is that
    **constraint enforcement is not subject to row-level security** - a
    conflict can be raised against a row the session cannot `SELECT` - and
    that is safe here precisely because a cross-tenant conflict is impossible
    to construct in the first place. There is no existence oracle.
18. **The state machine is a set of atomic conditional `UPDATE`s.**
    `PENDING → CONFIRMED | CANCELLED`, `CONFIRMED → COMPLETED | NO_SHOW |
    CANCELLED`; terminal states are terminal. Each transition is `UPDATE
    appointments SET status = :next, version = version + 1 WHERE id = :id AND
    status = :expected AND version = :v`, and the affected-row count decides
    the outcome - never an `if (appointment.status() == EXPECTED)` after a
    separate read. Because the constraint's `WHERE` is partial on
    `('PENDING','CONFIRMED')`, cancelling releases the slot as a side effect
    of the same `UPDATE`, with no second statement and no window in which the
    slot is neither free nor taken.
19. **Reschedule is a slot move under the same constraint, plus notification
    replanning.** Recompute the new slot from the service (rule 10), `UPDATE`
    `starts_at`, `ends_at`, `blocked_from`, `blocked_until` conditionally on
    the current status and version, and let the constraint arbitrate: a
    `23P01` on the update is the same `409 SLOT_UNAVAILABLE`. In the same
    transaction, cancel the pending reminder rows for the old time and insert
    new ones for the new time, plus a reschedule-notice row for the customer.
    The dedupe key of each reminder embeds its target instant
    (`appointment:{uuid}:REMINDER_24H:{scheduled_at_epoch_seconds}`), so a
    reschedule produces a naturally distinct key with no version counter.
    Never delete-then-insert the appointment: it changes the id, breaks the
    audit trail, and opens a window where a third party takes the slot.
20. **The price is frozen onto the appointment at booking time.** The
    `ServiceOffering` price read inside the transaction is copied into
    `customer_price_amount_minor` / `customer_price_currency`, exposed in Java
    as `customerPrice()`. A later price change never mutates a past booking.
    The name says whose price it is - what the customer was quoted - so a
    platform fee or a payout figure can be added later as new columns without
    making historical rows ambiguous.
21. **Two concurrency tests are mandatory, both against real PostgreSQL.**
    Testcontainers PostgreSQL 18, driven through the real HTTP surface with a
    signed test JWT so the interceptor chain, the connection-level RLS
    binding, and the request scope all behave as in production.
    (a) *Same staff:* N parallel threads booking the identical slot with
    *distinct* idempotency keys - exactly one `201`, exactly N-1
    `409 SLOT_UNAVAILABLE`, exactly one active row.
    (b) *Any staff:* a provider with N active staff, N concurrent "any
    available staff" requests for the same instant - exactly N `201`s, on N
    *distinct* `staff_id`s, proving rule 9's retry works. Add a jqwik property
    test asserting that every slot the calculator proposes inserts without
    `23P01`, which is what keeps rule 11 honest. Never H2, never a mocked
    repository: the behaviour under test *is* the constraint.

## Anti-patterns

- `blocked_from = blocked_until` allowed by the schema - the generated
  `tstzrange` is empty, `&&` is false against every other range, and an
  unbounded number of appointments insert at the same instant while the
  database reports success (verified on PostgreSQL 18.6) → state
  `ck_appointments_block_nonempty`, `ck_appointments_window`,
  `ck_appointments_block_covers` and `duration_minutes > 0` explicitly
  (rule 3).
- `blocked_range tstzrange GENERATED ALWAYS AS (tstzrange(starts_at -
  make_interval(mins => …), …)) STORED` - PostgreSQL raises `42P17` and the
  migration never runs → store `blocked_from`/`blocked_until` as columns and
  generate only the range (rule 2).
- Relying on "`duration_minutes > 0`, therefore the range is never empty"
  instead of writing the checks - a Flyway data fix or a future default
  reopens the hole with no error anywhere → each `CHECK` is stated (rule 3).
- `FOREIGN KEY (provider_id, staff_id) REFERENCES provider_staff (provider_id,
  id)` with `provider_staff` declaring only `PRIMARY KEY (id)` - the migration
  fails on a fresh database with `42830` (verified) → add
  `UNIQUE (provider_id, id)` to `provider_staff`, `service_offerings`,
  `customers` and `appointments` (rule 5).
- `CREATE TABLE appointments (… EXCLUDE USING gist (provider_id WITH =, …))`
  with no `CREATE EXTENSION btree_gist` ahead of it - `uuid =` has no GiST
  operator class and the migration fails on a fresh database → install the
  extension first (rule 5).
- Mapping every `23P01` straight to `409`, including the server-chosen staff
  path - five simultaneous requests at a five-chair salon return one booking
  and four "fully booked" errors with four chairs free → retry the
  server-chosen path against the next candidate in a new transaction
  (rule 9).
- Retrying the failed transaction instead of opening a new one - it is
  already marked rollback-only and every subsequent statement fails → the
  retry loop sits outside the transaction and each attempt starts its own
  (rule 9).
- `entityManager.persist(entity); entityManager.flush();` inside a
  `try/catch` as the idempotent insert - a replayed key and a genuine double
  booking arrive as two different SQLSTATEs through the same catch, and the
  transaction is rollback-only even for the harmless replay → `INSERT … ON
  CONFLICT (provider_id, idempotency_key) DO NOTHING` then `SELECT`
  (rule 14).
- `ON CONFLICT DO NOTHING` with **no** conflict target - an unqualified `DO
  NOTHING` also arbitrates the exclusion constraint, so a real double booking
  is swallowed and reported to the client as a successful replay → always
  name `(provider_id, idempotency_key)` (rule 14).
- An `idempotency_key` column with no `idempotency_request_hash` - the same
  key sent with a different service or a different time returns the first
  appointment and reports success, so the customer is told they booked
  something they did not → store the hash, `422 IDEMPOTENCY_KEY_REUSED` on a
  mismatch (rule 14).
- `if (repo.hasOverlap(staffId, from, to)) throw …; repo.insertIfAbsent(a);`
  as the only guard - both racers read "free" and both insert → the exclusion
  constraint decides; keep the pre-check only for the friendly message
  (rule 1).
- A nullable `staff_id` with `EXCLUDE … (coalesce(staff_id, provider_id) WITH
  =, …)` - an unassigned booking never compares against a named one and the
  provider is double-booked with a `201` returned → `staff_id NOT NULL`,
  `OWNER` row on provider creation, staff resolved before insert (rules 6, 7,
  8).
- Widening the busy ranges by the requested service's buffers before
  comparing - each stored `blocked_range` already contains its own buffers, so
  the buffer is applied twice and real free time disappears from the public
  page → widen the candidate only (rule 11).
- Comparing a raw `[starts_at, ends_at)` candidate against busy ranges - the API advertises a slot the constraint immediately rejects with `23P01`
  → widen the candidate by the requested service's buffers (rule 11).
- `redisLock("slot:" + staffId + ":" + startsAt)` around the insert - outside
  the transaction, expirable, lost on restart, unenforced for any other
  writer → delete it; the constraint is the guarantee (rule 16).
- `SELECT … FROM providers WHERE id = :p FOR UPDATE` to serialise bookings - correctness now depends on every future path taking the same lock, and
  serialises the whole provider besides → remove it (rule 16).
- Persisting `ends_at` from the request body, or trusting a client-sent
  `duration_minutes` - a client shrinks its own footprint and books inside an
  existing appointment → recompute from the `ServiceOffering` (rule 10).
- `blocked_range` built with `'[]'` bounds - back-to-back appointments at
  10:00 conflict with each other for no reason → `'[)'` (rule 2).
- An exclusion constraint with no `WHERE` clause - a cancelled appointment
  keeps blocking its slot forever → partial on
  `status IN ('PENDING','CONFIRMED')` (rules 1, 18).
- Justifying `provider_id WITH =` as the thing that stops a cross-tenant
  comparison - it is not, since `staff_id` is globally unique and bound to one
  provider by a composite FK; the false reason survives until someone tests it
  and then the real reasons get dropped too → keep the key, state selectivity
  and defence in depth (rule 17).
- Sending the confirmation SMS inside the booking transaction - the gateway's
  latency becomes lock-hold time, and a rollback after a sent message is a lie
  to the customer → insert a `notifications` row and commit (rule 12).
- `appointment.setStatus(CANCELLED); repo.save(appointment);` after a separate
  read - last writer wins silently and a confirm can overwrite a cancel →
  conditional `UPDATE … WHERE status = :expected AND version = :v`, check the
  count (rule 18).
- Rescheduling as `DELETE` + `INSERT` - new id, broken audit trail, and a
  window where a third party takes the freed slot → conditional `UPDATE` of
  the time columns (rule 19).
- Mapping `23P01` to `500`, or to a generic `409` with a free-text message
  and no code - clients cannot distinguish "slot taken" from any other
  conflict → RFC 7807 with `SLOT_UNAVAILABLE` (rule 15).
- A conflict message reading "already booked by Aminata for a Coupe Homme" - it leaks another customer's data → a neutral message (rule 15).
- A booking test on H2 or against a mocked repository - H2 has no
  `EXCLUDE USING gist`, so the test proves nothing about the invariant →
  Testcontainers PostgreSQL 18 (rule 21).
- Shipping the any-staff retry with only the same-staff concurrency test - the bug rule 9 fixes is invisible to test (a) → both tests, always
  (rule 21).

## Minimal correct example

The normative migration. Every other skill that shows this table shows an
excerpt of *this* file:

```sql
-- V014__create_appointments.sql
-- The one normative appointments DDL. Other skills excerpt it; this runs.

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- uuid "=" needs a GiST opclass

-- Prerequisites for the composite foreign keys below. Without a matching
-- UNIQUE, PostgreSQL rejects the FK with 42830 on a fresh database; a
-- PRIMARY KEY on (id) alone does NOT satisfy a (provider_id, id) reference.
ALTER TABLE provider_staff
    ADD CONSTRAINT uq_provider_staff_provider_id UNIQUE (provider_id, id);
ALTER TABLE service_offerings
    ADD CONSTRAINT uq_service_offerings_provider_id UNIQUE (provider_id, id);
ALTER TABLE customers
    ADD CONSTRAINT uq_customers_provider_id UNIQUE (provider_id, id);

-- A zero-length service makes ends_at = starts_at; with zero buffers that is
-- an EMPTY tstzrange, which "&&" never matches. Close it at the source.
ALTER TABLE service_offerings
    ADD CONSTRAINT ck_service_offerings_duration CHECK (duration_minutes > 0);

CREATE TABLE appointments (
    id                          uuid        PRIMARY KEY,
    provider_id                 uuid        NOT NULL,
    staff_id                    uuid        NOT NULL,   -- never nullable
    customer_id                 uuid        NOT NULL,
    service_offering_id         uuid        NOT NULL,
    status                      text        NOT NULL,
        -- PENDING | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW
    starts_at                   timestamptz NOT NULL,
    ends_at                     timestamptz NOT NULL,

    -- Buffers frozen from the ServiceOffering at booking time. They are
    -- columns, not a join, so ck_appointments_block_derived can pin the
    -- derivation in the database instead of in a code comment.
    buffer_before_minutes       int         NOT NULL
        CHECK (buffer_before_minutes >= 0),
    buffer_after_minutes        int         NOT NULL
        CHECK (buffer_after_minutes  >= 0),

    -- Ordinary columns, computed by the application. A GENERATED column may
    -- NOT call make_interval: "timestamptz - interval" is STABLE, not
    -- IMMUTABLE, and PostgreSQL refuses the migration with 42P17.
    blocked_from                timestamptz NOT NULL,
    blocked_until               timestamptz NOT NULL,

    -- tstzrange() over two stored columns IS immutable, so only the range
    -- is generated. This is what the exclusion constraint compares.
    blocked_range               tstzrange   GENERATED ALWAYS AS
        (tstzrange(blocked_from, blocked_until, '[)')) STORED,

    customer_price_amount_minor bigint      NOT NULL,   -- frozen at booking
    customer_price_currency     varchar(3)  NOT NULL
        CHECK (customer_price_currency ~ '^[A-Z]{3}$'),

    idempotency_key             text        NOT NULL,
    idempotency_request_hash    text        NOT NULL,

    version                     bigint      NOT NULL DEFAULT 0,
    created_at                  timestamptz NOT NULL,

    -- notifications references appointments the same composite way.
    CONSTRAINT uq_appointments_provider_id UNIQUE (provider_id, id),
    CONSTRAINT uq_appointments_idempotency
        UNIQUE (provider_id, idempotency_key),

    -- Composite FKs: a cross-tenant reference is physically impossible, and
    -- staff_id is therefore bound to exactly one provider.
    CONSTRAINT fk_appointments_staff FOREIGN KEY (provider_id, staff_id)
        REFERENCES provider_staff (provider_id, id),
    CONSTRAINT fk_appointments_service_offering
        FOREIGN KEY (provider_id, service_offering_id)
        REFERENCES service_offerings (provider_id, id),
    CONSTRAINT fk_appointments_customer FOREIGN KEY (provider_id, customer_id)
        REFERENCES customers (provider_id, id),

    -- Stated one by one. An EMPTY blocked_range defeats "&&" entirely, so
    -- none of these may be left to transitivity.
    CONSTRAINT ck_appointments_window
        CHECK (ends_at > starts_at),
    CONSTRAINT ck_appointments_block_nonempty
        CHECK (blocked_until > blocked_from),
    CONSTRAINT ck_appointments_block_covers
        CHECK (blocked_from <= starts_at AND blocked_until >= ends_at),

    -- A CHECK *may* call make_interval, even though a generated column may
    -- not. That asymmetry is why the block window is derived here.
    CONSTRAINT ck_appointments_block_derived CHECK (
        blocked_from  = starts_at - make_interval(mins => buffer_before_minutes)
        AND blocked_until = ends_at + make_interval(mins => buffer_after_minutes)
    ),

    -- THE invariant.
    CONSTRAINT no_double_booking EXCLUDE USING gist (
        provider_id   WITH =,   -- leading key: selectivity, defence in depth
        staff_id      WITH =,   -- globally unique, bound to one provider
        blocked_range WITH &&
    ) WHERE (status IN ('PENDING', 'CONFIRMED'))
);

-- Busy-range lookup for the slot calculator.
CREATE INDEX ix_appointments_staff_window
    ON appointments (provider_id, staff_id, starts_at)
    WHERE status IN ('PENDING', 'CONFIRMED');

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE  ROW LEVEL SECURITY;

-- nullif(..., true) degrades to NULL and filters every row: an unbound GUC
-- gives a deterministic 404, not 42704 or 22P02. See multi-tenant-rls.
CREATE POLICY provider_isolation ON appointments
    USING      (provider_id
                = nullif(current_setting('app.provider_id', true), '')::uuid)
    WITH CHECK (provider_id
                = nullif(current_setting('app.provider_id', true), '')::uuid);
```

The domain computes the slot from the frozen buffers, mirroring
`ck_appointments_block_derived` exactly:

```java
// booking/domain - framework-free.
public record BookedSlot(Instant startsAt, Instant endsAt,
                         int bufferBeforeMinutes, int bufferAfterMinutes) {

    /** Derived from the service alone; the client never contributes an end. */
    public static BookedSlot of(Instant startsAt, ServiceDuration service) {
        return new BookedSlot(
            startsAt,
            startsAt.plusSeconds(service.durationMinutes() * 60L),
            service.bufferBeforeMinutes(),
            service.bufferAfterMinutes());
    }

    public Instant blockedFrom() {
        return startsAt.minusSeconds(bufferBeforeMinutes * 60L);
    }

    public Instant blockedUntil() {
        return endsAt.plusSeconds(bufferAfterMinutes * 60L);
    }

    /** What the calculator tests against busy: the widened candidate. */
    public InstantRange blockedRange() {
        return InstantRange.halfOpen(blockedFrom(), blockedUntil());
    }
}
```

The orchestrator is deliberately **not** transactional: it owns the retry, and
each attempt gets a fresh transaction.

```java
@ApplicationScoped
public class BookAppointmentService implements BookAppointmentUseCase {

    // constructor injection omitted for brevity; see backend-di

    @Override
    @Transactional(Transactional.TxType.NEVER)   // the retry needs new ones
    public BookingResult book(BookAppointmentCommand command) {
        if (command.staffId().isPresent()) {
            // The customer named this person. A conflict is the real answer.
            return attempt.once(command, command.staffId().get());
        }

        // Server-chosen: least-loaded first, ties by id. A hint, not a lock.
        List<StaffId> candidates = staffAssignment.eligibleFor(command);
        if (candidates.isEmpty()) {
            throw new NoEligibleStaffException(command.serviceOfferingId());
        }
        for (StaffId candidate : candidates) {
            try {
                return attempt.once(command, candidate);
            } catch (SlotUnavailableException taken) {
                // Another racer got this chair. Next chair, new transaction.
            }
        }
        throw new SlotUnavailableException(command.startsAt());
    }
}
```

One attempt: one transaction, ordered, no network I/O, ambient tenant.

```java
@ApplicationScoped
public class BookAppointmentAttempt {

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    @TenantBound
    public BookingResult once(BookAppointmentCommand command, StaffId staffId) {
        Provider provider = providers.requireCurrent();
        ServiceOffering service =
            lookupServiceOffering.require(command.serviceOfferingId());

        // Recomputed server-side: nothing about duration comes from the wire.
        BookedSlot slot = BookedSlot.of(command.startsAt(), service.duration());

        availability.requireBookable(provider, staffId, slot);   // pure domain

        CustomerId customerId = customers.upsertByPhone(command.customer());

        Appointment appointment = Appointment.pending(
            staffId, customerId, service.id(), slot,
            service.price(),                        // frozen onto the row
            command.idempotency(),                  // key + request hash
            clock.instant());

        InsertOutcome outcome = appointments.insertIfAbsent(appointment);
        if (outcome.isReplay()) {
            return BookingResult.replayed(outcome.stored());
        }

        // Outbox rows in the SAME transaction; the worker sends them later.
        notifications.enqueueAll(appointment.plannedNotifications(provider));
        auditTrail.record(AuditEvent.appointmentBooked(appointment));

        return BookingResult.created(appointment);
    }
}
```

The adapter: an explicit conflict target, so a replay is a row count and a
double booking is still an exception.

```java
@ApplicationScoped
public class AppointmentPostgresRepository implements AppointmentRepository {

    private static final String EXCLUSION_VIOLATION = "23P01";

    @Override
    public InsertOutcome insertIfAbsent(Appointment appointment) {
        int inserted;
        try {
            // DO NOTHING with an EXPLICIT target arbitrates only the
            // idempotency index; 23P01 from no_double_booking still raises.
            inserted = entityManager.createNativeQuery("""
                INSERT INTO appointments (
                    id, provider_id, staff_id, customer_id,
                    service_offering_id, status, starts_at, ends_at,
                    buffer_before_minutes, buffer_after_minutes,
                    blocked_from, blocked_until,
                    customer_price_amount_minor, customer_price_currency,
                    idempotency_key, idempotency_request_hash, created_at)
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (provider_id, idempotency_key) DO NOTHING
                """)
                .setParameter(1, appointment.id().value())
                /* … remaining bindings … */
                .executeUpdate();
        } catch (PersistenceException e) {
            if (isExclusionViolation(e)) {
                // No further DB access: the transaction is rollback-only.
                throw new SlotUnavailableException(appointment.startsAt());
            }
            throw e;
        }

        if (inserted == 1) {
            return InsertOutcome.created(appointment);
        }

        // Zero rows means the key already exists: a replay, never an error.
        StoredAppointment stored = requireByIdempotencyKey(
            appointment.idempotencyKey());
        if (!stored.requestHash().equals(appointment.requestHash())) {
            throw new IdempotencyKeyReuseException(appointment.idempotencyKey());
        }
        return InsertOutcome.replayed(stored);
    }

    private static boolean isExclusionViolation(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof SQLException sql
                    && EXCLUSION_VIOLATION.equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }
}
```

The exception carries the published code; `platform-api`'s single
`ExceptionMapper<DomainException>` renders it as RFC 7807, and it never names
the other party:

```java
package com.balaaca.booking.domain;

public final class SlotUnavailableException extends DomainException {

    public SlotUnavailableException(Instant startsAt) {
        // Stable English message key; the i18n catalogue resolves the text.
        super("SLOT_UNAVAILABLE", 409, "booking.slot.unavailable",
              Map.of("starts_at", startsAt.toString()));
    }
}
```

The state machine as one conditional statement - cancelling frees the slot
because the constraint is partial:

```java
int cancel(AppointmentId id, long version) {
    return entityManager.createNativeQuery("""
        UPDATE appointments
           SET status = 'CANCELLED', version = version + 1
         WHERE id = :id
           AND status IN ('PENDING', 'CONFIRMED')
           AND version = :version
        """)
        .setParameter("id", id.value())
        .setParameter("version", version)
        .executeUpdate();   // 1 = cancelled and the slot is free, 0 = lost
}
```

Both mandatory concurrency tests, through the real HTTP surface so the
interceptor chain and the connection-level RLS binding run as in production:

```java
@QuarkusTest
class AppointmentConcurrencyIT {   // Testcontainers PostgreSQL 18

    private static final int THREADS = 32;

    @Test
    void exactlyOneRacerWinsWhenTheStaffMemberIsNamed() throws Exception {
        ProviderFixture provider = seedProviderWithOwnerStaff();
        UUID service = seedServiceOffering(provider, 30);
        Instant startsAt = provider.nextOpenSlot();

        // Distinct idempotency keys: this measures the constraint, not the
        // idempotency record (see idempotency-concurrency).
        List<Response> responses = runInParallel(THREADS, () ->
            bookingApi.post("/v1/appointments", provider.staffToken(),
                            body(service, startsAt, provider.ownerStaffId(),
                                 freshKey())));

        assertThat(statuses(responses)).filteredOn(s -> s == 201).hasSize(1);
        assertThat(statuses(responses)).filteredOn(s -> s == 409)
            .hasSize(THREADS - 1);
        assertThat(codes(responses)).containsOnly("SLOT_UNAVAILABLE", null);
        assertThat(appointments.countActiveAt(provider, startsAt)).isEqualTo(1);
    }

    @Test
    void nStaffAbsorbNConcurrentAnyStaffRequests() throws Exception {
        ProviderFixture provider = seedProviderWithStaff(5);   // five chairs
        UUID service = seedServiceOffering(provider, 30);
        Instant startsAt = provider.nextOpenSlot();

        // staff_id omitted: the server chooses, and must retry on 23P01.
        List<Response> responses = runInParallel(5, () ->
            bookingApi.post("/v1/appointments", provider.customerToken(),
                            body(service, startsAt, null, freshKey())));

        assertThat(statuses(responses)).containsOnly(201);
        assertThat(bookedStaffIds(responses)).hasSize(5).doesNotHaveDuplicates();
    }
}
```

## Sibling skills

- `backend-architecture` - why `BookedSlot` and the state machine live in
  `booking/domain` while the `23P01` translation lives in the persistence
  adapter, and why `shared-kernel` is the one context exempt from the
  four-layer rule.
- `idempotency-concurrency` - the `Idempotency-Key` header, the request hash,
  `IDEMPOTENCY_KEY_REUSED`, and the `version` column behind the conditional
  `UPDATE`s.
- `multi-tenant-rls` - `provider_id` is ambient from `TenantContext`, the
  `app.provider_id` GUC is bound by a connection-level hook rather than by an
  interceptor, and the composite foreign keys make a cross-tenant reference
  impossible.
- `temporal-modelling` - `starts_at` as `timestamptz`, availability rules in
  the provider's IANA zone including windows that wrap past midnight, the
  injected `Clock`, and the slot tests that must also run under a DST zone.
- `outbox-messaging` - the `notifications` rows inserted in the booking
  transaction, their `scheduled_at` due column, and the dedupe key that embeds
  the target instant.
- `backend-tests` - Testcontainers PostgreSQL 18 is mandatory here; both
  concurrency tests and the mutation gate on `booking` are not optional.
- `backend-exceptions` - `SlotUnavailableException` as a subclass of the one
  `DomainException` base, mapped once at the boundary.
- `platform-api` - the published error-code catalogue containing
  `SLOT_UNAVAILABLE` and `IDEMPOTENCY_KEY_REUSED`, and the `/v1` route
  prefix with snake_case wire fields.
- `money-currency` - the frozen `customer_price_amount_minor` /
  `customer_price_currency` pair and the `Money` type behind `customerPrice()`.
