# ADR-0003 - A PostgreSQL exclusion constraint against double booking

Status: Accepted
Verified empirically on PostgreSQL 18.6 on 2026-08-29.
Amended the same day after an adversarial review, before any implementation. The
first version fell short on three points, all verified and corrected below.

## Context

Two customers must never get the same slot. It is the most critical invariant of
the product: breaking it destroys the provider's trust, and no compensation
repairs a customer who turned up for nothing.

The protections on the table were: an application check before insert
(ineffective, two concurrent requests both pass it), a Redis lock (Redlock is not
a safe locking algorithm), a `SELECT ... FOR UPDATE` on a slot row (which forces
every slot to be materialised), or a database constraint.

## Decision

The guarantee lives **in PostgreSQL**, as an exclusion constraint. The DDL below
is the one that was executed and tested, not an intention.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- otherwise "uuid =" has no GiST opclass

CREATE TABLE appointments (
    id                  uuid PRIMARY KEY,
    provider_id         uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    staff_id            uuid NOT NULL,
    service_offering_id uuid NOT NULL,
    customer_id         uuid NOT NULL,

    starts_at    timestamptz NOT NULL,
    ends_at      timestamptz NOT NULL,
    -- Frozen at booking time: a later edit of the service offering never moves
    -- what an existing appointment blocks.
    buffer_before_minutes int NOT NULL CHECK (buffer_before_minutes >= 0),
    buffer_after_minutes  int NOT NULL CHECK (buffer_after_minutes  >= 0),
    blocked_from  timestamptz NOT NULL,
    blocked_until timestamptz NOT NULL,

    status  varchar(20) NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
    version bigint NOT NULL DEFAULT 0,

    blocked_range tstzrange GENERATED ALWAYS AS
        (tstzrange(blocked_from, blocked_until, '[)')) STORED,

    CONSTRAINT ck_appointments_window         CHECK (ends_at > starts_at),
    CONSTRAINT ck_appointments_block_nonempty CHECK (blocked_until > blocked_from),
    CONSTRAINT ck_appointments_block_covers   CHECK (blocked_from  <= starts_at
                                                 AND blocked_until >= ends_at),
    CONSTRAINT ck_appointments_block_derived  CHECK (
        blocked_from  = starts_at - make_interval(mins => buffer_before_minutes)
    AND blocked_until = ends_at   + make_interval(mins => buffer_after_minutes)),

    FOREIGN KEY (provider_id, staff_id)            REFERENCES provider_staff    (provider_id, id),
    FOREIGN KEY (provider_id, service_offering_id) REFERENCES service_offerings (provider_id, id),
    FOREIGN KEY (provider_id, customer_id)         REFERENCES customers         (provider_id, id),
    CONSTRAINT uq_appointments_tenant UNIQUE (provider_id, id));

ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (provider_id WITH =, staff_id WITH =, blocked_range WITH &&)
    WHERE (status IN ('PENDING','CONFIRMED'));
```

The choices that carry the guarantee:

**`staff_id` is `NOT NULL`.** A resource key written as
`coalesce(staff_id, provider_id)` would be a bug: an "any available staff"
booking would only ever conflict with other unassigned ones, never with a named
appointment. Creating a provider therefore creates a `provider_staff` row with
role `OWNER`, and "anybody" is resolved **on the server** into a concrete
resource before the insert.

**It is `blocked_range` that excludes**, not the visible slot. The buffers are
part of the blocked range; the customer sees `starts_at` to `ends_at`.

**Half-open bounds `[)`**: 10:00 to 11:00 and 11:00 to 12:00 do not overlap.

**A partial `WHERE` on the active statuses**: cancelling frees the slot, the
index stays compact, history gets in the way of nothing.

Forbidden: no Redis lock, no advisory lock, no `SELECT ... FOR UPDATE` for slot
exclusion. The `23P01` violation is translated into `409 SLOT_UNAVAILABLE`, never
into a stack trace.

### Correction 1 - the empty range neutralised the constraint

Verified: with `blocked_from = blocked_until`, `tstzrange` produces the **empty**
range, and in PostgreSQL the `&&` operator is **false** against anything. An
unlimited number of appointments then inserted at the same instant, constraint
satisfied.

The path was reachable: a service offering with `duration_minutes = 0`, or any
slot calculation bug. `ck_appointments_block_nonempty` and
`CHECK (duration_minutes > 0)` on `service_offerings` close it. The first version
only guarded it by transitivity; transitivity does not survive the first schema
change.

### Correction 2 - the blocked range must be derivable, not declarative

The most serious hole. `blocked_from` and `blocked_until` are written by the
application: nothing tied them to `starts_at`, `ends_at` or the buffers. A caller
declaring a narrow range, `blocked_from = starts_at` and
`blocked_until = starts_at + 1 minute` for an hour-long haircut, got a success
and left 59 minutes unprotected. The promise that "the guarantee holds for every
code path" was therefore false: it only held against the range the writer chose
to declare.

`ck_appointments_block_derived` pins the derivation **in the database**. It rests
on an asymmetry in PostgreSQL, verified in both directions:

| Expression | Generated column | `CHECK` constraint |
|---|---|---|
| `timestamptz - make_interval(...)` | **refused**, `42P17` (the expression is not `IMMUTABLE`) | **accepted** |

That is precisely why `blocked_from` and `blocked_until` are ordinary columns
computed by the application, while only `blocked_range` is generated, and why the
derivation can be enforced by a `CHECK` all the same.

### Correction 3 - composite FKs require a UNIQUE on the target

Verified: without `UNIQUE (provider_id, id)` on the referenced table, the
migration fails with `42830`. `provider_staff`, `service_offerings`, `customers`
and `appointments` itself therefore declare it.

### Correction 4 - "any available staff" must not answer 409

A product bug, not a technical one. The server picks a concrete staff member, the
least loaded one for instance, before inserting. Under concurrency **every
contender computes the same candidate**. Five simultaneous requests in a salon
with five free chairs: one succeeds, four are told the slot is taken.

The answer depends on who chose the staff member:

- **staff named by the customer**: `23P01` becomes `409` immediately;
- **staff chosen by the server**: `23P01` triggers a retry of the unit of work in
  a **new transaction** against the next candidate, bounded by the number of
  eligible staff. `409` only once they are all taken.

The first concurrency test could not see this defect: it used a single staff
member. A second test is mandatory: N staff, N simultaneous "anybody" requests,
N successes across N distinct staff.

### Correction 5 - the justification of the exclusion key was wrong

The first version claimed `provider_id` had to be in the key to prevent a
comparison across tenants. That is inaccurate: `staff_id` is a globally unique
uuid, tied to its provider by a composite FK, so `staff_id WITH =` alone already
cannot match another tenant.

`provider_id` stays in the key, for index selectivity and as defence in depth,
but for **that** reason. The related observation does remain accurate, though:
the constraint is evaluated over every row, RLS or not, and it cannot reveal
anything about another provider because a cross-tenant conflict is impossible by
construction.

## Verification

Run on PostgreSQL 18.6. 19 cases on the first schema, then 7 more on the
corrected schema:

| Case | Expected | Observed |
|---|---|---|
| Same slot / partial overlap / enclosing, same staff | `23P01` rejection | rejected |
| Adjacent slot, half-open bounds | accepted | accepted |
| Same slot, other staff or other provider | accepted | accepted |
| Rebooking a slot freed by a cancellation | accepted | accepted |
| Cross reference to another tenant's resource | `23503` rejection | rejected |
| Overlapping opening-hour segments | `23P01` rejection | rejected |
| **10 simultaneous transactions on the same slot** | **1 success, 9 x `23P01`** | **1 row, 9 conflicts** |
| **Empty blocked range** | `23514` rejection | rejected |
| **Fraudulently narrowed blocked range** | `23514` rejection | rejected |
| **`blocked_from` inconsistent with the declared buffer** | `23514` rejection | rejected |
| **Service offering of zero duration** | `23514` rejection | rejected |
| Slot overlapping a neighbour's buffer | `23P01` rejection | rejected |
| Slot starting exactly at the end of the buffer | accepted | accepted |

## Consequences

Positive: the guarantee holds for every code path, the public API, the dashboard,
the back office, the worker, a future chatbot, a manual SQL fix, and for any
number of instances. It works at `READ COMMITTED` isolation, with no
serialisation-failure handling. It costs nothing on reads.

Negative: the project is tied to PostgreSQL, which it already was. Tests touching
this constraint need a real PostgreSQL, never H2. The raw error message names the
constraint and must never reach the client. The next-candidate retry
(correction 4) adds a path whose termination has to be bounded and tested.

## Revisit when

A resource other than the staff member becomes bookable: a room, a piece of
equipment, a vehicle. The constraint key then has to name it, and the no-leak
analysis has to be redone.
