---
name: temporal-modelling
description: Use when adding any column, DTO field or OpenAPI property holding a date, time, timestamp or duration; when writing or changing availability_rules, availability_overrides, the booking policy or the slot calculator in scheduling; when converting a provider's local opening hours into instants; or when reviewing a PR containing LocalDateTime, Instant.now(), ZoneId.systemDefault(), timestamp without time zone, a date typed as String, a hardcoded Africa/Conakry, or a CHECK that forbids a window spanning midnight.
---

# temporal-modelling

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Dates and times are the second-easiest thing to get catastrophically wrong in a
booking product, right after tenancy. Two kinds of time exist here and they are
never interchangeable: an **instant** (when an appointment actually happens) and
a **local wall-clock intention** (when a provider says they open). Instants are
`timestamptz`; recurring hours are local time plus the provider's IANA zone;
overrides are local dates. A `java.time.Clock` is injected everywhere, the
local-to-instant conversion lives in exactly one place, and the slot calculator
is a pure function so it can be exhaustively tested without a database.

## When to use

- Adding any column, field, DTO property, or OpenAPI schema that holds a date,
  a time, a timestamp, an interval, or a duration.
- Writing or changing `availability_rules`, `availability_overrides`, the
  booking policy, or the slot calculator in `scheduling`.
- Persisting or reading an `Appointment` start/end, or rendering a provider's
  opening hours on their public page.
- Anything that compares "now" against a stored value: minimum lead time,
  maximum advance horizon, cancellation window, a reminder row scheduled into
  the `notifications` outbox.
- Reviewing a PR that contains `LocalDateTime.now()`, `Instant.now()`,
  `ZoneId.systemDefault()`, `timestamp without time zone`, a date typed as
  `String`, a hardcoded `Africa/Conakry`, or a `CHECK` that makes a window
  spanning midnight unrepresentable.

## The rules

1. **Classify every temporal concept as an instant or as local wall-clock time
   *before* choosing its type.** An instant is a fixed point on the global
   timeline - it means the same moment to a customer in Conakry and to a
   dashboard in Paris, and it is what an appointment *is*. A local wall-clock
   value is an intention expressed inside the provider's own day: "we open at
   09:00 on Tuesdays" stays 09:00 whatever the offset does. Converting between
   the two always requires **both a zone and a concrete date** - a rule alone
   is not an instant and never becomes one until you pick a day.
2. **Instants are `Instant` in Java and `timestamptz` in PostgreSQL, stored as
   UTC.** `appointments.starts_at`, `appointments.ends_at`, `created_at`,
   `cancelled_at`, `notifications.scheduled_at`, `notifications.sent_at`. Never
   `timestamp` without time zone: that column type is an instant with the zone
   silently discarded, and it will be read back through whatever the session
   zone happens to be. Never store an instant as a `text`, a `bigint` of epoch
   millis, or two columns.
3. **Recurring availability is local time plus the provider's zone, never an
   instant.** `availability_rules` stores `day_of_week smallint` (ISO
   numbering, 1 = Monday, matching `DayOfWeek.getValue()`) with `start_time
   time` and `end_time time`; the zone is not repeated on the row, it is read
   from the owning provider. A rule materialises into instants only against a
   concrete date, at query time. Store weekly hours as instants and the salon
   opens an hour late twice a year in every market that observes DST.
4. **A window may span midnight, and the schema must let it.** The constraint
   on `availability_rules` and `availability_overrides` is `CHECK (start_time
   <> end_time)`, never `start_time < end_time`. A bar or a clinic open
   22:00–01:00 is an ordinary provider, and `<` makes it unrepresentable while
   rule 12 demands a test for exactly that case. The convention: **`end_time <
   start_time` means the window closes on the next local date**, and it is
   resolved in `LocalWindows.window`, which advances `endDate` by one local day - one day through the zone rules, never "plus 24 hours". An equal pair is
   rejected rather than silently read as either an empty window or a
   twenty-four-hour one, in the database by the `CHECK` and in Java by an
   explicit throw.
5. **Overrides are local dates.** `availability_overrides` carries
   `override_date date` and a `kind` of `CLOSED`, `REPLACED_HOURS`, or
   `EXTRA_HOURS`, with `start_time` / `end_time` required for the last two and
   null for the first. The aggregate is `AvailabilityOverride` - never
   `AvailabilityException`, because a domain type that is not throwable and
   ends in `Exception` is a trap for every reader and every `catch` block. A
   closed day is *the provider's day in the provider's zone*, not a 24-hour UTC
   block - those two differ by hours at both ends for most of the world.
6. **The provider owns the timezone, and nothing anywhere assumes a single
   one.** `providers.timezone text NOT NULL DEFAULT 'Africa/Conakry'`,
   validated against `ZoneId.getAvailableZoneIds()` on write and mapped to a
   `ZoneId` in the domain. `Africa/Conakry` appears in exactly two places - the
   migration default and the registration default - and nowhere else.
   `ZoneId.of("UTC")` as a stand-in and `ZoneId.systemDefault()` are both
   banned in business code: the JVM's zone is a deployment accident, not a
   business fact.

   The complete map. Every new temporal field matches a row of this table:

   | Concept | Java type | SQL type |
   |---|---|---|
   | Appointment start / end | `Instant` | `timestamptz` |
   | Blocked range, buffers included | `InstantRange` | `tstzrange`, `[)` |
   | Audit stamps (`created_at`, `cancelled_at`) | `Instant` | `timestamptz` |
   | Weekly opening hours | `DayOfWeek` + `LocalTime` | `smallint` + `time` |
   | Availability override day | `LocalDate` | `date` |
   | Override custom hours | `LocalTime` | `time` nullable |
   | Provider timezone | `ZoneId` | `text`, IANA id |
   | Service duration and buffers | `Duration` | `int`, `*_minutes` |
   | Minimum lead time | `Duration` | `int`, `*_minutes` |
   | Maximum advance horizon | `Period` | `int`, `*_days` |
   | A computed slot | `AvailabilitySlot(Instant, Instant, StaffId)` | never persisted |

7. **Durations are `Duration` in the domain and an integer column named for its
   unit.** `duration_minutes CHECK (duration_minutes > 0)`,
   `buffer_before_minutes CHECK (buffer_before_minutes >= 0)` and
   `buffer_after_minutes CHECK (buffer_after_minutes >= 0)` on
   `service_offerings`; `min_lead_time_minutes` and `max_horizon_days` on the
   booking policy. A zero or negative duration is not a degenerate service, it
   is an empty range that defeats the exclusion constraint downstream, so the
   `CHECK` is written out, not assumed. Never a bare `int duration` whose unit
   lives in a comment, never a free-form `"1h30"` string on a contract. On the
   OpenAPI document it is an integer of minutes, the unit in the snake_case
   property name (`duration_minutes`) and the range in the schema.
8. **A `java.time.Clock` is injected everywhere; "now" is a value, not a
   call.** One CDI producer supplies `Clock.systemUTC()` in production; tests
   inject `Clock.fixed(...)` and get a deterministic result.
   `LocalDateTime.now()`, `LocalDate.now()`, `Instant.now()`,
   `System.currentTimeMillis()` and `new Date()` are forbidden in `domain/` and
   `application/` - an ArchUnit rule fails the build on them. Code that reads
   the wall clock it cannot control is code whose lead-time and horizon
   behaviour cannot be tested.
9. **No date is ever handled as a `String`, and `LocalDateTime` is never stored
   or passed.** `LocalDateTime` is a date and a time with neither zone nor
   offset: it is not an instant and it is not a complete local rule, so it is
   always one `systemDefault()` away from a wrong answer. Parsing and
   formatting happen only at the adapter boundary, ISO-8601 on the wire
   (`2026-08-29`, `09:00`, `2026-08-29T09:00:00Z`) under snake_case property
   names (`starts_at`, `ends_at`, `scheduled_at`), and the parsed type crosses
   into the domain, never the text.
10. **The local-to-instant conversion exists in exactly one place, in
    `shared-kernel`.** `com.balaaca.sharedkernel.time.LocalWindows` is the only
    code in the repository that calls `.atZone(zone).toInstant()`. DST is
    resolved there, once, deliberately, and both behaviours are pinned by a
    test:
    - **Spring-forward gap.** `ZonedDateTime.of(date, time, zone)` does *not*
      return the first valid instant after the gap; it shifts the local time
      **later by the length of the gap**. In `Europe/Paris` on 2026-03-29 a
      one-hour gap turns 02:30 into 03:30, not into 03:00. Say what it does,
      because "first valid instant" is off by thirty minutes here and by an
      arbitrary amount for a provider whose window starts mid-gap.
    - **Autumn fold.** A local time that occurs twice resolves to the *earlier*
      offset, which is already what `ZonedDateTime.of` does; the explicit
      `.withEarlierOffsetAtOverlap()` is therefore a **no-op that documents the
      default rather than changing it**. Keep it for the reader, and never let
      anyone believe it is what makes the behaviour correct.

    Every service, calculator and adapter that needs an instant calls
    `LocalWindows`; none of them re-derives the rule.
11. **Every temporal interval is half-open, `[start, end)`.** A 10:00–10:30
    appointment and a 10:30–11:00 appointment do not overlap. The domain's
    `InstantRange`, the SQL `tstzrange(..., '[)')` behind the GiST exclusion
    constraint, and the slot list returned by the API all use the same
    convention, so a boundary never means two different things in two layers.
12. **The slot calculator is a pure function, and it widens only the
    candidate.** It takes the availability rules, the overrides, the busy
    ranges of existing `PENDING`/`CONFIRMED` appointments, the requested
    service's duration and buffers, the booking policy, the requested range,
    the provider's zone, and `now` - and returns slots. No repository, no
    `Clock` field, no `TenantContext`, no CDI, no `Instant.now()` inside.
    Three details make it agree with the database instead of contradicting it:
    - **`busy` is the stored `blocked_range` of each active appointment, and is
      never widened again.** That range already contains *that* appointment's
      own frozen buffers. Adding the requested service's buffers to it a second
      time hides slots that are genuinely free.
    - **The candidate is widened by the requested service's buffers, and it is
      the widened candidate that is tested against `busy`.** Skip this and the
      API advertises slots the exclusion constraint then rejects with a `409`.
    - **`busy` is a `Map<StaffId, List<InstantRange>>`**, so the "any available
      staff" path sees every candidate rather than a flattened union in which
      one busy chair closes the whole salon.

    Loading the inputs is the application service's job; the calculator only
    *proposes*. What is actually free is decided by PostgreSQL's exclusion
    constraint at insert time, never by the calculator.
13. **The public availability endpoint returns only bookable slots.**
    `GET /v1/providers/{slug}/available-slots` returns a list of bookable
    windows and nothing else: no `available` flag, no busy ranges, no uniform
    grid. A grid with an `available` field is a minute-by-minute occupancy map
    of a named person at a named place, served to unauthenticated callers and
    free to scrape - that is the reason, not a timing oracle. Opening hours may
    be published separately, as declared local hours, for UI layout.
14. **These edge cases have named tests, and a slot calculator arriving without
    them does not pass review.** A day with no rule at all (closed); a day with
    two segments and a break between them; one test per override kind
    (`CLOSED`, `REPLACED_HOURS`, `EXTRA_HOURS`); a service longer than the
    window remaining before closing, which must yield no slot rather than a
    slot that overruns; the minimum lead time trimming the front of the range;
    the maximum advance horizon trimming the back; a window that spans midnight
    into the next local day (22:00–01:00, rule 4); a DST transition in both
    directions, spring gap and autumn fold; and - against real PostgreSQL - a property test asserting that **every slot the calculator proposes inserts
    without `23P01`**, which is the only test that proves rules 11 and 12 hold
    against the constraint rather than against a second copy of the same
    assumption.
15. **Slot property tests run under a DST zone, not only the launch zone.**
    Guinea is UTC+0 the whole year and observes no DST, which means a broken
    local-to-instant conversion returns exactly the right answer in Conakry and
    the wrong answer everywhere else - the suite stays green while the code is
    wrong. `Europe/Paris` is therefore mandatory in the zone arbitrary, and a
    southern-hemisphere zone such as `America/Santiago` is worth adding so the
    two transitions occur in the opposite order. CI runs the JVM with a `TZ`
    that is neither UTC nor `Africa/Conakry`, so any leaked `systemDefault()`
    surfaces as a failure instead of a coincidence.

## Anti-patterns

- `starts_at timestamp NOT NULL` (without time zone) for an appointment - the
  offset is dropped on write and re-invented on read from the session zone
  → `timestamptz` (rule 2).
- Storing weekly opening hours as `timestamptz` "the first Tuesday", then
  adding seven days repeatedly → local `time` plus `day_of_week`, materialised
  per date through the provider's zone (rule 3).
- `CHECK (start_time < end_time)` on `availability_rules` - a provider open
  22:00–01:00 cannot be stored at all, and the mandatory midnight test cannot
  be written → `CHECK (start_time <> end_time)`, `end_time < start_time`
  meaning the window wraps into the next local date (rules 4, 14).
- A conversion helper that returns a 24-hour window when `start_time` equals
  `end_time` - the provider meant nothing of the sort and the slot list is
  silently wrong for a whole day → reject the equal pair explicitly (rule 4).
- An `AvailabilityException` domain class holding a closed day - a
  non-throwable type ending in `Exception` misleads every reader and every
  `catch` → `AvailabilityOverride`, table `availability_overrides` (rule 5).
- `LocalDateTime openingTime` on `AvailabilityRule`, or a `String date` on a
  DTO reaching the domain → `LocalTime` + `DayOfWeek`, parsed at the adapter
  (rules 3, 9).
- `ZoneId.of("Africa/Conakry")` anywhere in `scheduling` or `booking` → read
  `provider.timezone()`; the launch market is a default, not an invariant
  (rule 6).
- `ZoneId.systemDefault()` "because the server runs in the right zone" - it
  runs wherever the container is scheduled → the provider's zone, explicitly
  (rule 6).
- `int duration` / `long buffer` with the unit only in a comment, or
  `duration_minutes` with no positivity check - a zero duration produces an
  empty `tstzrange`, which overlaps nothing and lets unlimited appointments
  share an instant → `duration_minutes int NOT NULL CHECK (duration_minutes >
  0)` and `Duration` in the domain (rule 7).
- `if (appointment.startsAt().isBefore(Instant.now()))` inside a domain method
  → inject `Clock`, or take `now` as a parameter (rule 8).
- `LocalDate.now()` in an application service to decide today's slots - the
  test can then only assert against the machine's real calendar → `Clock`
  injected, `LocalDate.now(clock.withZone(providerZone))` (rules 8, 9).
- Each adapter doing its own `date.atTime(local).atZone(zone).toInstant()`, so
  the DST policy differs between the public page and the booking endpoint →
  one `LocalWindows` in `shared-kernel` (rule 10).
- A comment or test claiming `ZonedDateTime.of` returns "the first valid
  instant after the gap" - it returns the local time shifted later by the gap
  length, so 02:30 becomes 03:30, and an assertion written to the wrong
  description will be patched until it matches the wrong code → state the real
  semantics (rule 10).
- Treating the autumn fold as an error, or trusting
  `.withEarlierOffsetAtOverlap()` to be what fixes it - it is a no-op after
  `ZonedDateTime.of` → one documented, tested resolution rule (rule 10).
- Closed intervals, so 10:00–10:30 and 10:30–11:00 are reported as a conflict
  (or `tstzrange(...)` left at its `'[)'` default in SQL while the domain uses
  `isBefore`/`isAfter` inclusively) → half-open everywhere (rule 11).
- Widening `busy` by the requested service's buffers - the stored
  `blocked_range` already carries the *other* appointment's buffers, so the
  calculator subtracts them twice and hides free slots → widen the candidate
  only (rule 12).
- Comparing an unwidened candidate against `busy` - the API advertises a slot,
  the constraint rejects the insert, and the customer gets a `409` on a slot
  the product just offered them → widen the candidate by the requested
  service's buffers (rule 12).
- `List<InstantRange> busy` flattened across all staff - one busy chair closes
  a five-chair salon → `Map<StaffId, List<InstantRange>>` (rule 12).
- A `SlotCalculator` that injects `AppointmentRepository` and `Clock`, so
  testing one edge case needs a database and a frozen system time → a pure
  function fed by the application service (rule 12).
- Asking the calculator whether a slot is free and then inserting on the
  strength of that answer, with no exclusion constraint underneath → the
  calculator proposes, the constraint decides (rule 12).
- A public `available-slots` response of the shape `[{ "starts_at": …,
  "available": false }]` - it publishes a named person's occupancy to anyone
  with the provider's slug → return bookable slots only (rule 13).
- `blocked_range tstzrange GENERATED ALWAYS AS (tstzrange(starts_at -
  make_interval(mins => buffer_before_minutes), …)) STORED` - PostgreSQL
  rejects the migration with `42P17`, so the schema never even exists → plain
  `blocked_from` / `blocked_until` columns and a `CHECK` that pins the
  derivation (see the excerpt below, and `booking-integrity` for the whole
  table).
- Slot tests written only against `Africa/Conakry`, passing forever while the
  conversion is wrong → `Europe/Paris` in the zone set (rules 14, 15).
- A "spans midnight" case handled by adding 24 hours - which is not a day
  across a DST boundary → cross the boundary through `LocalWindows` on the
  next local date (rules 4, 10, 14).

## Minimal correct example

The schema, showing each concept in its correct SQL type:

```sql
-- V006__add_providers_timezone.sql
ALTER TABLE providers
    ADD COLUMN timezone text NOT NULL DEFAULT 'Africa/Conakry';
-- The default is the launch market, not an assumption: every read goes
-- through this column, never through a constant.

-- V011__create_availability.sql
CREATE TABLE availability_rules (
    id           uuid     PRIMARY KEY,
    provider_id  uuid     NOT NULL,
    staff_id     uuid     NOT NULL,
    day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time   time     NOT NULL,
    end_time     time     NOT NULL,
    -- "<>" not "<": end_time < start_time is a window that closes on the
    -- NEXT local date (a bar open 22:00-01:00). Only an empty window is
    -- rejected here.
    CONSTRAINT ck_availability_rules_window
        CHECK (start_time <> end_time),
    CONSTRAINT fk_availability_rules_staff
        FOREIGN KEY (provider_id, staff_id)
        REFERENCES provider_staff (provider_id, id)
);
-- A break is two rules on the same day, not a nullable "pause" column.

CREATE TABLE availability_overrides (
    id            uuid PRIMARY KEY,
    provider_id   uuid NOT NULL,
    staff_id      uuid NOT NULL,
    override_date date NOT NULL,
    kind          text NOT NULL
        CHECK (kind IN ('CLOSED', 'REPLACED_HOURS', 'EXTRA_HOURS')),
    start_time    time,
    end_time      time,
    CONSTRAINT ck_availability_overrides_hours CHECK (
        (kind =  'CLOSED' AND start_time IS NULL
                          AND end_time   IS NULL)
     OR (kind <> 'CLOSED' AND start_time IS NOT NULL
                          AND end_time   IS NOT NULL
                          AND start_time <> end_time)),
    CONSTRAINT fk_availability_overrides_staff
        FOREIGN KEY (provider_id, staff_id)
        REFERENCES provider_staff (provider_id, id)
);
```

The temporal columns of `appointments`, as an **excerpt**. The normative
definition - the exclusion constraint, the composite foreign keys, the
idempotency columns, the frozen price, RLS - lives in `booking-integrity` as
`V014__create_appointments.sql`, and this excerpt never diverges from it:

```sql
-- EXCERPT of V014__create_appointments.sql (owned by booking-integrity).
-- Temporal columns only; see booking-integrity for the full table.
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- before any EXCLUDE

CREATE TABLE appointments (
    id                    uuid        PRIMARY KEY,
    provider_id           uuid        NOT NULL,
    staff_id              uuid        NOT NULL,
    starts_at             timestamptz NOT NULL,
    ends_at               timestamptz NOT NULL,

    -- Buffers are frozen with the price at booking time: a later change to
    -- the service offering never moves what an existing appointment blocks.
    buffer_before_minutes int NOT NULL CHECK (buffer_before_minutes >= 0),
    buffer_after_minutes  int NOT NULL CHECK (buffer_after_minutes  >= 0),

    -- Ordinary columns, computed by the application. They CANNOT be
    -- generated: "timestamptz +/- interval" is STABLE, not IMMUTABLE, and a
    -- generated column requires an IMMUTABLE expression, so the make_interval
    -- form is rejected at migration time with 42P17. A CHECK constraint has
    -- no such restriction, which is why the derivation below is pinned by a
    -- CHECK while only the range itself is generated.
    blocked_from          timestamptz NOT NULL,
    blocked_until         timestamptz NOT NULL,
    blocked_range         tstzrange   GENERATED ALWAYS AS
        (tstzrange(blocked_from, blocked_until, '[)')) STORED,

    -- An EMPTY range overlaps nothing: with blocked_from = blocked_until the
    -- exclusion constraint admits unlimited appointments at the same instant.
    -- Each CHECK is written out; transitive protection is not protection.
    CONSTRAINT ck_appointments_window
        CHECK (ends_at > starts_at),
    CONSTRAINT ck_appointments_block_nonempty
        CHECK (blocked_until > blocked_from),
    CONSTRAINT ck_appointments_block_covers
        CHECK (blocked_from <= starts_at AND blocked_until >= ends_at),
    CONSTRAINT ck_appointments_block_derived CHECK (
        blocked_from  = starts_at - make_interval(mins => buffer_before_minutes)
    AND blocked_until = ends_at   + make_interval(mins => buffer_after_minutes)),

    -- Referenced by notifications (provider_id, appointment_id): a composite
    -- FK needs a matching UNIQUE or PostgreSQL raises 42830.
    CONSTRAINT uq_appointments_tenant UNIQUE (provider_id, id)
    -- ... exclusion constraint, FKs, idempotency, price, RLS: see
    -- booking-integrity.
);
```

The single conversion point, in `shared-kernel`:

```java
package com.balaaca.sharedkernel.time;

/** The only place local wall-clock intentions become instants. */
public final class LocalWindows {

    private LocalWindows() { }

    /**
     * Resolve a provider's local wall-clock time on a given local date to an
     * instant. DST is decided here and nowhere else, and both branches are
     * locked by LocalWindowsDstTest:
     *
     * - Spring-forward gap: ZonedDateTime.of shifts the local time LATER BY
     *   THE LENGTH OF THE GAP. In Europe/Paris on 2026-03-29 a one-hour gap
     *   turns 02:30 into 03:30 -- not into 03:00, the first valid instant.
     * - Autumn fold: the EARLIER offset wins, which is already what
     *   ZonedDateTime.of does. The call below documents that default; it does
     *   not change it.
     */
    public static Instant toInstant(LocalDate date, LocalTime local,
                                    ZoneId zone) {
        return ZonedDateTime.of(date, local, zone)
                .withEarlierOffsetAtOverlap()   // no-op, kept as documentation
                .toInstant();
    }

    /**
     * Half-open [start, end). endLocal before startLocal means the window
     * closes on the NEXT local date: a provider open 22:00-01:00. An equal
     * pair is an error, never a silent 24-hour window; the database rejects
     * it too, with CHECK (start_time <> end_time).
     */
    public static InstantRange window(LocalDate date,
                                      LocalTime startLocal,
                                      LocalTime endLocal,
                                      ZoneId zone) {
        if (startLocal.equals(endLocal)) {
            throw new IllegalArgumentException(
                    "empty availability window at " + startLocal);
        }
        LocalDate endDate = endLocal.isAfter(startLocal)
                ? date
                : date.plusDays(1);          // one local day, not +24 hours
        return InstantRange.halfOpen(toInstant(date, startLocal, zone),
                                     toInstant(endDate, endLocal, zone));
    }
}
```

The calculator is pure: everything it needs arrives as an argument, and it
widens the candidate rather than the busy ranges.

```java
package com.balaaca.scheduling.domain;

/** Inputs of a slot computation. No repository, no clock, no tenant. */
public record SlotQuery(ZoneId zone,
                        Instant now,
                        InstantRange requestedRange,
                        List<StaffId> eligibleStaff,
                        List<AvailabilityRule> rules,
                        List<AvailabilityOverride> overrides,
                        // Stored blocked_range of PENDING + CONFIRMED rows,
                        // per staff member. Already contains each of THOSE
                        // appointments' own frozen buffers: never widen it.
                        Map<StaffId, List<InstantRange>> busy,
                        Duration serviceDuration,
                        Duration bufferBefore,   // of the REQUESTED service
                        Duration bufferAfter,
                        BookingPolicy policy) { }  // lead time, horizon, step

public final class SlotCalculator {

    private SlotCalculator() { }

    /** Only bookable slots come back. There is no "available: false". */
    public static List<AvailabilitySlot> compute(SlotQuery query) {
        InstantRange bounded = query.requestedRange()
                .clampStart(query.now().plus(query.policy().minLeadTime()))
                .clampEnd(query.policy().horizonEnd(query.now(), query.zone()));
        // ... open windows per local date via LocalWindows, minus overrides,
        // stepped by the policy granularity, keeping only candidates that fit
        // serviceDuration entirely inside a window and pass fitsFor below.
    }

    /**
     * The candidate is widened by the REQUESTED service's buffers, and the
     * widened candidate is what the busy ranges are tested against. This is
     * exactly what the EXCLUDE USING gist constraint will compare at insert
     * time, so a proposed slot never turns into a 409.
     */
    private static boolean fitsFor(StaffId staff, InstantRange candidate,
                                   SlotQuery query) {
        InstantRange blocked = candidate.expand(query.bufferBefore(),
                                                query.bufferAfter());
        return query.busy().getOrDefault(staff, List.of()).stream()
                .noneMatch(blocked::overlaps);
    }
}
```

The application service is what touches the database, and it hands `now` in:

```java
@ApplicationScoped
public class ListAvailableSlotsService implements ListAvailableSlotsUseCase {

    private final AvailabilityRuleRepository rules;
    private final AvailabilityOverrideRepository overrides;
    private final AppointmentRepository appointments;
    private final Clock clock;                       // never Instant.now()

    // constructor injection omitted

    @Override
    public List<AvailabilitySlot> list(SlotRequest request) {
        Provider provider = providers.requireCurrent();  // tenant is ambient
        List<StaffId> eligible = staff.eligibleFor(request.serviceOffering());

        return SlotCalculator.compute(new SlotQuery(
                provider.timezone(),
                clock.instant(),
                request.range(),
                eligible,
                rules.forStaff(eligible),
                overrides.forStaff(eligible, request.range()),
                // Map<StaffId, List<InstantRange>>: the stored blocked_range
                // per staff member, so "any staff" sees every candidate.
                appointments.busyRangesByStaff(eligible, request.range()),
                request.serviceOffering().duration(),
                request.serviceOffering().bufferBefore(),
                request.serviceOffering().bufferAfter(),
                provider.bookingPolicy()));
    }
}
```

jqwik proves the laws over generated inputs, in more than one zone:

```java
class SlotCalculatorProperties {

    @Provide
    Arbitrary<ZoneId> zones() {
        // Africa/Conakry is UTC+0 with no DST, so it can never expose a
        // conversion bug. Europe/Paris is mandatory; America/Santiago runs
        // the two transitions in the opposite order.
        return Arbitraries.of(ZoneId.of("Africa/Conakry"),
                              ZoneId.of("Europe/Paris"),
                              ZoneId.of("America/Santiago"));
    }

    @Property
    void everySlotFallsInsideADeclaredWindowAndMissesEveryBreak(
            @ForAll("zones") ZoneId zone,
            @ForAll("openingDays") List<AvailabilityRule> rules,
            @ForAll @IntRange(min = 5, max = 240) int durationMinutes) {

        SlotQuery query = aQuery(zone, rules,
                                 Duration.ofMinutes(durationMinutes));
        List<AvailabilitySlot> slots = SlotCalculator.compute(query);

        List<InstantRange> open = openWindows(rules, zone,
                                              query.requestedRange());
        List<InstantRange> breaks = gapsBetween(open);

        for (AvailabilitySlot slot : slots) {
            assertThat(open).anyMatch(w -> w.contains(slot.range()));
            assertThat(breaks).noneMatch(p -> p.overlaps(slot.range()));
        }
    }

    @Property
    void noSlotStartsBeforeTheMinimumLeadTime(
            @ForAll("zones") ZoneId zone,
            @ForAll("openingDays") List<AvailabilityRule> rules) {

        SlotQuery query = aQuery(zone, rules, Duration.ofMinutes(30));
        Instant earliest = query.now().plus(query.policy().minLeadTime());

        assertThat(SlotCalculator.compute(query))
                .allMatch(slot -> !slot.startsAt().isBefore(earliest));
    }
}
```

The one property the calculator cannot prove about itself: every slot it
proposes must actually insert. This runs against Testcontainers PostgreSQL 18,
because the assertion *is* the constraint.

```java
@QuarkusTest
class ProposedSlotsAreInsertableIT {   // Testcontainers PostgreSQL 18

    @Property(tries = 200)
    void everyProposedSlotInsertsWithoutAnExclusionViolation(
            @ForAll("zones") ZoneId zone,
            @ForAll("openingDays") List<AvailabilityRule> rules) {

        ProviderFixture provider = seedProvider(zone, rules);
        SlotQuery query = aQuery(provider);

        for (AvailabilitySlot slot : SlotCalculator.compute(query)) {
            // insertIfAbsent throws SlotUnavailableException on 23P01. If the
            // calculator and the constraint disagree about buffers, this is
            // where it surfaces -- not in production as a spurious 409.
            assertThatNoException().isThrownBy(() ->
                    appointments.insertIfAbsent(pendingAt(provider, slot)));
        }
    }
}
```

The DST behaviour is pinned by example, not left to chance:

```java
@Test // 2026-03-29, Europe/Paris: 02:00-03:00 local does not exist
void springForwardGapShiftsTheLocalTimeLaterByTheGapLength() {
    Instant resolved = LocalWindows.toInstant(
            LocalDate.of(2026, 3, 29), LocalTime.of(2, 30), PARIS);
    // 02:30 becomes 03:30 -- shifted by the one-hour gap, NOT snapped to the
    // first valid instant (03:00).
    assertThat(resolved).isEqualTo(Instant.parse("2026-03-29T01:30:00Z"));
}

@Test // 2026-10-25, Europe/Paris: 02:00-03:00 local happens twice
void autumnFoldResolvesToTheEarlierOffset() {
    Instant resolved = LocalWindows.toInstant(
            LocalDate.of(2026, 10, 25), LocalTime.of(2, 30), PARIS);
    assertThat(resolved).isEqualTo(Instant.parse("2026-10-25T00:30:00Z"));
}

@Test // A bar open 22:00-01:00: the window closes on the next local date
void aWindowSpanningMidnightEndsOnTheNextLocalDate() {
    InstantRange window = LocalWindows.window(
            LocalDate.of(2026, 8, 29), LocalTime.of(22, 0),
            LocalTime.of(1, 0), PARIS);
    assertThat(window.end()).isEqualTo(Instant.parse("2026-08-29T23:00:00Z"));
}
```

## Sibling skills

- `booking-integrity` - owner of the normative `appointments` DDL excerpted
  above; what the calculator proposes, the GiST exclusion constraint on
  `blocked_range` decides, on the same half-open convention and the same
  server-recomputed duration and buffers.
- `backend-tests` - where the jqwik zone arbitrary, the ArchUnit ban on
  `Instant.now()`, and the Testcontainers insertability property live and gate
  the build.
- `money-currency` - the sibling freeze: the buffers and the customer price are
  both snapshotted onto the appointment at booking time, both persisted in
  columns named for exactly what they hold.
- `backend-architecture` - why `LocalWindows` belongs to `shared-kernel` and
  why a pure `SlotCalculator` sits in `scheduling/domain` with no framework
  import.
- `platform-api` - ISO-8601 in snake_case properties on `/v1` routes, and why
  the public slot response carries no occupancy information.
- `code-language` - dates are never formatted into a user-facing string in the
  domain; the i18n catalogue and the client render an ISO-8601 instant.
