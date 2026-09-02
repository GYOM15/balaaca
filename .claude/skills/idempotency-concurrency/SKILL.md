---
name: idempotency-concurrency
description: Use when writing or reviewing a mutating command that a client may retry or that two requests may race - POST /v1/appointments and its Idempotency-Key, an appointment state transition, an "any available staff" booking, a notifications drain loop - or when a PR reaches for a read-then-write guard, a persist-and-catch idempotency path, a Redis SETNX lock, or claims one mechanism covers both concerns.
---

# idempotency-concurrency

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Idempotency and concurrency are two **different** obligations, and every
booking-touching feature needs **both**. Idempotency answers "the same request
arrives twice"; concurrency answers "two different requests hit the same row, or
the same time slot, at once". A unique key does not protect a concurrent edit,
and a version check does not make a retry safe.

## When to use

- Any command that creates or advances an `Appointment`, or that mutates a
  `ServiceOffering`, `AvailabilityRule`, `ProviderStaff` or `Subscription`.
- Any endpoint a client may retry - a double-tapped "Confirm" button, a mobile
  connection that drops after the request left the phone, a proxy timeout - and
  in particular `POST /v1/appointments`, which declares `Idempotency-Key` as a
  required header.
- Any state transition (`PENDING -> CONFIRMED`, `CONFIRMED -> CANCELLED`) or
  counter that two requests could race on.
- Booking with "any available staff", where every concurrent racer computes the
  same preferred staff member and a naive mapping turns free chairs into `409`s.
- Any notification row drained by `notification-worker`, which is at-least-once
  by construction and multi-instance by design.
- Reviewing a PR with a read-modify-write, a "check then insert", an overlap
  check done in Java, or a claim that one mechanism covers both concerns.

## The rules

1. **Treat idempotency and concurrency as separate requirements; satisfy both.**
   Before merging a mutating command, answer two questions independently: *what
   happens if this exact request runs twice?* (idempotency) and *what happens if
   two distinct requests mutate this aggregate, or claim this slot,
   simultaneously?* (concurrency). Neither answer is "the other mechanism covers
   it".
2. **Idempotency: a replay of the same key returns the first result and repeats
   no effect.** `Idempotency-Key` is a declared, required header on appointment
   creation. It is stored as `appointments.idempotency_key` under
   `UNIQUE (provider_id, idempotency_key)`. The first request books; a second
   request carrying the same key returns the same appointment - the customer who
   double-taps gets one 10:00 haircut, not two.
3. **The key is stored beside a fingerprint of the request, and a reused key
   with a different body is an error, not a replay.** Every appointment row
   carries `idempotency_request_hash text NOT NULL`, the SHA-256 of the
   canonicalised request body (`service_offering_id`, `starts_at`, `staff_id`,
   `customer_id`, in a fixed order). On a hit, compare: an **equal** hash is a
   replay and returns the stored appointment with its original `2xx` body; a
   **different** hash is a client bug - a key recycled across two genuinely
   different bookings - and returns `422` with the published code
   `IDEMPOTENCY_KEY_REUSED`. Returning the first appointment for a second,
   different request and calling it success is how a customer ends up believing
   they booked Tuesday when the row says Monday.
4. **Retention is the life of the appointment row.** The key and its hash live
   on the appointment and are deleted with it - there is no sweeper, no TTL, and
   no 24-hour window. Say that in the contract; do not document a window nothing
   implements. A client that retries a week later against a still-existing
   appointment still gets the replay, which is the behaviour we want.
5. **The UNIQUE index is the authority; Redis is only a shortcut.** An
   idempotency record in Redis may answer a replay without touching PostgreSQL,
   but Redis evicts, restarts and expires. Never let a cache be the only thing
   standing between a retried request and a duplicate appointment: the index
   must make the duplicate impossible even with Redis cold.
6. **Insert with `INSERT … ON CONFLICT (provider_id, idempotency_key) DO
   NOTHING`, then `SELECT`; never `persist`-and-catch on the idempotency
   path.** With an assigned identifier a UNIQUE violation surfaces only at flush
   or commit, *after* your try/catch, and by then the transaction is
   rollback-only, so the compensating re-query fails too. One statement, no
   exception path, transaction still usable. Name the conflict target
   explicitly: an explicit target arbitrates **only** that index, so a `23P01`
   from the exclusion constraint still surfaces instead of being swallowed by a
   bare `DO NOTHING`. If a `23505` on the idempotency index does reach you from
   some other path, it is a **replay**, never an error: re-read the stored
   outcome in a **new** transaction and return it.
   This rule is about the *idempotency* path only. The exclusion constraint is
   the opposite case: its `23P01` is meant to abort the transaction, and rule 8
   says what to do with it.
7. **Concurrency: mutable aggregates carry `version bigint` (optimistic
   locking), and state transitions are atomic and conditional in the database.**
   `Appointment`, `ServiceOffering` and `Subscription` have a `version`. Advance
   the appointment state machine with `UPDATE … SET status = :next,
   version = version + 1 WHERE id = :id AND status = :expected AND
   version = :v`, and check the affected-row count. The database - not an
   app-side `if (appointment.status() == EXPECTED)` after a separate read - arbitrates the race. Two staff members cancelling and completing the same
   appointment at once cannot both win; the loser gets an RFC 7807 `409`, never
   a silent overwrite.
8. **Slot exclusion is a database constraint, never a read-then-write check.**
   Overlap is guaranteed by
   `EXCLUDE USING gist (provider_id WITH =, staff_id WITH =, blocked_range WITH
   &&) WHERE (status IN ('PENDING','CONFIRMED'))`. There is no Redis lock, no
   advisory lock and no `SELECT … FOR UPDATE` for slot exclusion. "Is this slot
   free?" answered by a `SELECT` before the `INSERT` is a race, not a guard:
   both racers read "free". SQLSTATE `23P01` maps to `SlotUnavailableException`
   → `409 SLOT_UNAVAILABLE`. The normative DDL, including the non-empty-range
   and derived-buffer CHECKs without which the constraint can be defeated by an
   empty range, lives in `booking-integrity` as
   `V014__create_appointments.sql`; never restate it, excerpt it.
9. **A server-chosen staff member retries; a client-named one conflicts.** If
   the request named `staff_id`, a `23P01` means *that* person is busy: map it
   to `409 SLOT_UNAVAILABLE` at once. If the server chose the staff member
   ("any available"), all concurrent racers compute the same least-loaded
   candidate, and mapping the loser to `409` tells five customers a salon with
   five free chairs is full. Catch the `23P01`, and retry the whole unit of work
   in a **new** transaction against the next eligible candidate, bounded by the
   number of eligible staff. Only when every candidate has conflicted is the
   answer `409`.
10. **Notification dispatch needs both guards too.** The same dual requirement
    shows up in `notification-worker`: idempotency comes from
    `UNIQUE (dedupe_key)`, so a business transaction replayed by a retry
    enqueues the row at most once; concurrency comes from `SELECT … FOR UPDATE
    SKIP LOCKED` on `notifications` ordered by `scheduled_at`, so two worker
    instances draining the table never claim the same row. Drop either and the
    provider's customer gets two SMS reminders, or none.
11. **Pessimistic locking is not the default.** The only sanctioned
    `FOR UPDATE` in this codebase is the worker's `SKIP LOCKED` claim.
    Optimistic version checks handle aggregate edits; the exclusion constraint
    handles slots. Reach for a row lock only on a genuinely hot row where the
    retry cost under contention is worse than the lock, and say why in the PR.
12. **Never conflate the two mechanisms.** "We have a UNIQUE idempotency key, so
    we don't need a version" is wrong - the key stops *replays of one request*,
    not two *different* legitimate edits of the same appointment. "We have
    optimistic locking, so retries are safe" is wrong - the version stops *lost
    updates*, but a retried request with no key books a second appointment.
    "We have the EXCLUDE constraint, so we don't need idempotency" is wrong
    twice over: a replay of a *cancel-then-rebook* flow, or a retry landing
    after the first appointment was cancelled, does not overlap anything.
13. **Conflicts and duplicates map to RFC 7807 with published codes.** A slot
    collision is `409 SLOT_UNAVAILABLE`; a lost optimistic update is `409
    CONCURRENT_MODIFICATION`; a key replayed with a different body is `422
    IDEMPOTENCY_KEY_REUSED`. A genuine replay returns the original `2xx` body,
    not an error the second time. Any code used here must exist in the published
    catalogue in `platform-api` before it ships.


> **`ON CONFLICT` must repeat a partial index's predicate.** An idempotency key
> is optional, so its unique index is partial:
> `... ON appointments (provider_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
> A bare `ON CONFLICT (provider_id, idempotency_key)` then fails with `42P10`,
> "there is no unique or exclusion constraint matching the ON CONFLICT
> specification" - the arbiter cannot infer a partial index. Write
> `ON CONFLICT (provider_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
>
> This is a startup-time-invisible failure: the statement compiles, the schema is
> valid, and the first real booking is a 500.

## Anti-patterns

- `ON CONFLICT (a, b) DO NOTHING` against a partial unique index -> `42P10` at
  the first insert; repeat the index's `WHERE` clause in the conflict target.

- "There is a `UNIQUE (provider_id, idempotency_key)`, so versioning is
  unnecessary." → conflation; the key blocks a *replay*, not a concurrent
  distinct edit. Add `version` plus an atomic transition. (Rule 12)
- "There is an optimistic `version`, so retries are safe." → conflation; the
  version blocks a *lost update*, a client retry still re-runs the effect. Add
  the idempotency key. (Rule 12)
- Storing the key alone and treating every hit as a replay → a client that
  recycles one key across two different bookings is told the second succeeded
  and is shown the first appointment. Store `idempotency_request_hash` and
  return `422 IDEMPOTENCY_KEY_REUSED` on a mismatch. (Rule 3)
- Documenting a "24-hour idempotency window" with no job that enforces one →
  the contract lies. The key lives as long as the appointment. (Rule 4)
- `appointment = repo.find(id); appointment.confirm(); repo.save(appointment);`
  with no version check (last writer silently wins) → conditional
  `UPDATE … WHERE status = :expected AND version = :v`, check the row count.
  (Rule 7)
- `if (repo.findOverlapping(staffId, range).isEmpty()) repo.insert(…)` as the
  guard against double-booking → both racers see "no overlap"; let the EXCLUDE
  constraint decide and map `23P01` to `409 SLOT_UNAVAILABLE`. (Rule 8)
- Mapping every `23P01` straight to `409`, including on the "any available
  staff" path → N concurrent customers, N free chairs, one booking and N-1
  spurious conflicts. Retry the next candidate in a new transaction. (Rule 9)
- A Redis `SETNX` lock held around the booking insert → not an exclusion
  mechanism; it fails open on eviction, expiry or a second Redis node.
  (Rules 5, 8)
- `repo.persist(appointment)` inside `try { … } catch (ConstraintViolation…)`
  as the idempotency path → the violation lands at flush, the transaction is
  already rollback-only. Use `INSERT … ON CONFLICT … DO NOTHING` then `SELECT`.
  (Rule 6)
- A bare `ON CONFLICT DO NOTHING` with no conflict target → it also swallows the
  exclusion violation, and the double booking is reported as a success.
  (Rule 6)
- `.orElseThrow()` with no argument after the insert-then-select → the one race
  this design really has (`DO NOTHING` does not wait for an uncommitted
  concurrent insert, so the follow-up `SELECT` can see nothing) surfaces as a
  `NoSuchElementException` and a `500`. Throw a real domain exception. (Rule 6)
- A worker that drains `notifications` with a plain `SELECT … LIMIT 50` and no
  `FOR UPDATE SKIP LOCKED` → two instances send the same reminder twice.
  (Rule 10)
- `SELECT … FOR UPDATE` on every read "to be safe" → contention and lock waits;
  optimistic locking is the norm. (Rule 11)
- Returning a fresh `201` with a new appointment id for a replayed
  `Idempotency-Key` → return the stored original result. (Rule 13)

## Minimal correct example

**EXCERPT - idempotency columns only.** The normative `appointments` DDL, with
`blocked_from`/`blocked_until`, the derived-buffer and non-empty CHECKs, the
`btree_gist` extension and the exclusion constraint, is
`V014__create_appointments.sql` in `booking-integrity`. Do not copy the table
here and do not invent a second migration version for it; this shows only the
three columns this skill owns.

```sql
-- EXCERPT of V014__create_appointments.sql (normative copy: booking-integrity)
--   idempotency_key        text   NOT NULL,
--   idempotency_request_hash text NOT NULL,   -- SHA-256 of the canonical body
--   version                bigint NOT NULL DEFAULT 0,
--   CONSTRAINT uq_appointments_idempotency
--       UNIQUE (provider_id, idempotency_key),
--   CONSTRAINT uq_appointments_provider_id UNIQUE (provider_id, id),
--   CONSTRAINT ex_appointments_no_overlap
--       EXCLUDE USING gist (provider_id WITH =, staff_id WITH =,
--                           blocked_range WITH &&)
--       WHERE (status IN ('PENDING', 'CONFIRMED'))
```

Idempotent command. `provider_id` is ambient - it is never a parameter of the
command, the use case or the DTO.

```java
@Transactional
public Appointment book(BookAppointmentCommand command, StaffId staff) {
    // The slot is recomputed server-side from starts_at plus the service
    // offering's own duration and buffers; any end time sent by the client is
    // ignored. Buffers are frozen onto the row so the DB can check the
    // derivation.
    ServiceOffering offering =
            lookupServiceOffering.require(command.serviceOfferingId());
    Appointment candidate =
            Appointment.request(command, offering, staff, clock);

    // ON CONFLICT (provider_id, idempotency_key) DO NOTHING: exactly one racer
    // inserts, the loser writes nothing and no ConstraintViolationException is
    // thrown, so the transaction stays usable. The conflict target is explicit,
    // so a 23P01 from the exclusion constraint is NOT absorbed here.
    appointments.insertIfAbsent(candidate);

    Appointment stored = appointments
            .findByIdempotencyKey(command.idempotencyKey())
            // DO NOTHING does not wait for a concurrent uncommitted insert, so
            // this SELECT can legitimately find nothing. That is a race, not a
            // bug: 409, retry the same key.
            .orElseThrow(() -> new ConcurrentBookingException(
                    command.idempotencyKey()));

    // A key reused with a different body is a client error, never a replay.
    if (!stored.idempotencyRequestHash()
                .equals(candidate.idempotencyRequestHash())) {
        throw new IdempotencyKeyReusedException(command.idempotencyKey());
    }
    return stored;   // first insert or replay - same body either way
}
```

```java
// Adapter: one INSERT ... ON CONFLICT DO NOTHING - no pre-SELECT, no
// find-then-insert, no exception path to unwind on the idempotency key.
int insertIfAbsent(Appointment appointment) {
    return em.createNativeQuery("""
        INSERT INTO appointments
            (id, provider_id, staff_id, service_offering_id, customer_id,
             starts_at, ends_at, blocked_from, blocked_until,
             buffer_before_minutes, buffer_after_minutes, status,
             customer_price_amount_minor, customer_price_currency,
             idempotency_key, idempotency_request_hash, version)
        VALUES (:id, :providerId, :staffId, :serviceOfferingId, :customerId,
                :startsAt, :endsAt, :blockedFrom, :blockedUntil,
                :bufferBefore, :bufferAfter, :status,
                :amountMinor, :currency, :key, :hash, 0)
        ON CONFLICT (provider_id, idempotency_key) DO NOTHING
        """)
        .setParameter("id", appointment.id().value())
        .setParameter("providerId", tenantContext.require().value())
        .setParameter("staffId", appointment.staffId().value())
        .setParameter("serviceOfferingId",
                      appointment.serviceOfferingId().value())
        .setParameter("customerId", appointment.customerId().value())
        .setParameter("startsAt", appointment.startsAt())
        .setParameter("endsAt", appointment.endsAt())
        .setParameter("blockedFrom", appointment.blockedFrom())
        .setParameter("blockedUntil", appointment.blockedUntil())
        .setParameter("bufferBefore", appointment.bufferBeforeMinutes())
        .setParameter("bufferAfter", appointment.bufferAfterMinutes())
        .setParameter("status", appointment.status().name())
        .setParameter("amountMinor", appointment.customerPrice().amountMinor())
        .setParameter("currency", appointment.customerPrice().currency().code())
        .setParameter("key", appointment.idempotencyKey())
        .setParameter("hash", appointment.idempotencyRequestHash())
        .executeUpdate();   // 1 = we inserted, 0 = a racer already did
}
```

"Any available staff" retries the next candidate in a **new** transaction; a
client-named staff member conflicts immediately (rule 9):

```java
@ApplicationScoped
public class BookAppointmentService implements BookAppointmentUseCase {

    @Override
    public Appointment book(BookAppointmentCommand command) {
        if (command.staffId().isPresent()) {
            // The client named this person. A conflict is the honest answer.
            return bookOnce(command, command.staffId().get());
        }
        List<StaffId> candidates = staffAssignment.eligibleFor(command);
        for (StaffId candidate : candidates) {      // bounded by eligibility
            try {
                return bookOnce(command, candidate);     // its own transaction
            } catch (SlotUnavailableException retryNext) {
                // Every racer picked the same least-loaded chair. Take the next
                // one rather than telling a customer the salon is full.
            }
        }
        throw new SlotUnavailableException(command.startsAt());
    }
}
```

`bookOnce` is the `@Transactional` method above; each attempt is a fresh unit of
work because a `23P01` has already marked the previous one rollback-only.

Atomic, version-checked transition - the database arbitrates the race:

```java
@Transactional
public void confirm(AppointmentId id, long expectedVersion) {
    int updated = appointments.compareAndAdvance(
        id,
        /* from */ AppointmentStatus.PENDING,
        /* to   */ AppointmentStatus.CONFIRMED,
        expectedVersion);
    if (updated == 0) {
        // Status was not PENDING, or the version moved: we lost the race.
        throw new AppointmentConflictException(id);   // -> 409
    }
}
```

```java
// Adapter: one conditional UPDATE, not read-then-write. The RLS policy already
// scopes the row to the current provider, so a cross-tenant id simply matches
// nothing and the caller sees the same 409 as any other loser.
int compareAndAdvance(AppointmentId id,
                      AppointmentStatus expected,
                      AppointmentStatus next,
                      long version) {
    return em.createNativeQuery("""
        UPDATE appointments
           SET status = :next, version = version + 1
         WHERE id = :id AND status = :expected AND version = :version
        """)
        .setParameter("id", id.value())
        .setParameter("expected", expected.name())
        .setParameter("next", next.name())
        .setParameter("version", version)
        .executeUpdate();   // 1 = won, 0 = lost
}
```

The notification worker shows the same pair once more - `dedupe_key` for the
replay, `SKIP LOCKED` for the concurrent drain:

```sql
-- Enqueued in the SAME transaction as the appointment; UNIQUE (dedupe_key)
-- makes a retried booking enqueue the reminder at most once.
SELECT id, channel, recipient, variables
  FROM notifications
 WHERE status = 'PENDING' AND scheduled_at <= :now
 ORDER BY scheduled_at
 LIMIT :batchSize
   FOR UPDATE SKIP LOCKED;
```

Prove every property through the real stack (Testcontainers PostgreSQL 18, no
mocked database). Drive the concurrency suites through the **HTTP surface** with
a signed test JWT: the interceptor chain, the connection-level RLS binding and
the request scope then run exactly as in production, and no thread is missing a
`TenantContext`. Calling a use case directly from a raw thread works only if
that thread activates its own request context
(`Arc.container().requestContext()` activate/terminate), which is easy to forget
and silently changes what is under test.

```java
@Test // idempotency: same key, same body, twice -> one appointment, same id
void replayReturnsTheFirstAppointment() {
    var first  = post("/v1/appointments", body(), key("idem-key-1"));
    var second = post("/v1/appointments", body(), key("idem-key-1"));
    assertThat(second.id()).isEqualTo(first.id());
    assertThat(appointments.countByIdempotencyKey("idem-key-1")).isEqualTo(1);
}

@Test // idempotency: same key, DIFFERENT body -> 422, not a silent replay
void reusedKeyWithADifferentBodyIsRejected() {
    post("/v1/appointments", bodyAt("2026-03-02T10:00:00Z"), key("idem-key-2"));
    var second = post("/v1/appointments",
                      bodyAt("2026-03-03T10:00:00Z"), key("idem-key-2"));
    assertThat(second.status()).isEqualTo(422);
    assertThat(second.code()).isEqualTo("IDEMPOTENCY_KEY_REUSED");
}

@Test // concurrency: N threads, ONE named staff member -> one 201, N-1 409
void concurrentBookingsOfTheSameSlotHaveExactlyOneWinner() throws Exception {
    var results = runInParallel(16, () -> tryBook(sameSlotSameStaff()));
    assertThat(results).filteredOn(r -> r.status() == 201).hasSize(1);
    assertThat(results).filteredOn(r -> r.status() == 409).hasSize(15);
}

@Test // concurrency: N staff, N "any staff" requests -> N successes (rule 9)
void anyStaffBookingsFillEveryFreeChair() throws Exception {
    seedStaff(5);
    var results = runInParallel(5, () -> tryBook(sameSlotAnyStaff()));
    assertThat(results).allMatch(r -> r.status() == 201);
    assertThat(results).extracting(Result::staffId).doesNotHaveDuplicates();
}

@Test // concurrency: two threads advance the same appointment -> one wins
void concurrentTransitionsHaveExactlyOneWinner() throws Exception {
    AppointmentId id = seedPendingAppointment();
    var results = runInParallel(2, () -> tryConfirm(id, /* version */ 0L));
    assertThat(results).filteredOn(Result::won).hasSize(1);
    assertThat(appointments.get(id).status())
        .isEqualTo(AppointmentStatus.CONFIRMED);
}
```

## Sibling skills

- `booking-integrity` - owns the normative `appointments` migration, the
  exclusion constraint and its CHECKs, server-side slot recomputation and the
  appointment state machine; the canonical case for both guards at once.
- `outbox-messaging` - the `notifications` table is the outbox; at-least-once
  delivery means `dedupe_key` on the producing side and dedupe on the consuming
  side, drained with `FOR UPDATE SKIP LOCKED` ordered by `scheduled_at`.
- `contract-first` - `Idempotency-Key` is a declared, required header on
  appointment creation in the hand-authored OpenAPI document, not an
  undocumented convention.
- `platform-api` - `409` and `422` responses carry an RFC 7807 body with a
  stable code; published codes are never renamed or reused.
- `backend-exceptions` - `SlotUnavailableException`,
  `IdempotencyKeyReusedException` and friends all extend the single
  `DomainException` base in `com.balaaca.sharedkernel.error`.
- `money-currency` - the frozen `customer_price_amount_minor` rides on the very
  aggregate that carries the `version` column.
- `multi-tenant-rls` - the `UNIQUE (provider_id, …)` keys, the composite foreign
  keys and the `version` columns all live on tenant-scoped, RLS-forced tables,
  and the GUC that makes them work is bound on the connection, not by an
  interceptor.
- `backend-tests` - the replay test and the parallel-booking tests run over HTTP
  against Testcontainers PostgreSQL; the database is never mocked.
