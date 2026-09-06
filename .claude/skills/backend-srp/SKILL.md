---
name: backend-srp
description: Keeps one class to one reason to change across the bounded contexts. Use when writing or reviewing a CDI bean, an aggregate method or an adapter that risks doing several jobs at once - a service that orchestrates and queries and logs, a *Manager/*Helper/*Util, aggregate rules leaking into the application layer, cross-cutting concerns hand-rolled inside a method, or a state transition applied as a read-modify-write with dirty checking instead of one conditional UPDATE.
---

# backend-srp

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Single Responsibility is strict across every bounded context. One class =
one reason to change. Split by concern instead of lumping, and keep each
kind of work in its own layer.

## When to use

- Writing any new class in a core module (`booking`, `scheduling`,
  `catalog`, `providers`, `billing`, …) or a satellite.
- Reviewing a CDI bean that does more than one of: orchestrate a use
  case, hold aggregate behavior, talk to a DB/gateway, map DTOs,
  validate input, publish events.
- Writing a state transition - the moment where "read, decide in Java,
  save" quietly becomes two responsibilities and one race.
- Tempted to name something `*Manager`, `*Helper`, `*Util`, `*Processor` - a smell unless it is a genuinely stateless pure function.

## The rules

1. **One class = one reason to change.** If you describe it with "and" - "computes the slot *and* checks the plan quota *and* saves the
   appointment *and* sends the SMS" - split it. Each of those is a
   distinct concern with a distinct reason to change.
2. **Domain rules live in the domain, not the service.** There is no
   `Appointment` aggregate in `booking`, and there never was one: it was
   not deleted, it was never built. An aggregate has to be loaded before
   it can decide, and loading the row to decide on it in Java is exactly
   the read-modify-write rule 3 forbids. So the domain holds the rules
   that can be settled WITHOUT the row - `AppointmentStatus` with its
   legal-transition map (`canBecome`, `isTerminal`), and
   `BookedSlot.from(startsAt, duration, bufferBefore, bufferAfter)`,
   which derives the window and its buffers so a client cannot shrink
   what it blocks. `AppointmentStatus`'s own javadoc is explicit that the
   map is there to be asserted exhaustively without a database and is
   NOT what enforces the machine at runtime. The application service
   orchestrates; it does not re-implement the rules the domain owns.
   Money stays EXPLICIT: the price is frozen at booking from the
   offering into `customer_price_amount_minor` /
   `customer_price_currency`, and no later statement puts those columns
   in a `SET` list. It is never smuggled into an interceptor or a mapper.
   Where the invariant is owned by PostgreSQL, as with the
   no-double-booking exclusion constraint, the service does not
   re-implement it either (see `booking-integrity`).
3. **A state transition is ONE conditional UPDATE, never a
   read-modify-write.** Checking the status in Java and then letting
   Hibernate dirty-check the change is two responsibilities pretending
   to be one, and it is wrong under concurrency: two requests both read
   `PENDING`, both pass the Java check, and the second write silently
   overwrites the first. The AUTHORITY is a single statement whose
   `WHERE` clause carries the precondition:
   `UPDATE … WHERE id = :id AND status IN (…) RETURNING …`.
   No `AND version = :expected` anywhere: `appointments.version` is
   incremented by every transition so the column stays truthful, but no
   published operation carries a version for a caller to state, so there
   is nothing to compare it against. The `RETURNING` row IS the outcome,
   and an empty result is the refusal. WHICH refusal is worked out
   afterwards, from `snapshotOf(id)`: a row in a state that cannot be
   left is `InvalidStateTransitionException` (409), no row at all is
   `AppointmentNotFoundException` (404). Afterwards, not before - asking
   first is the read-modify-write this rule exists to avoid. There is no
   `AppointmentConflictException` to raise; that class was never built,
   because the snapshot can name the state the row is actually in and a
   generic clash cannot. Zero rows do not throw on their own - under RLS
   a write to another tenant's row also affects zero rows in silence, and
   answers as the same 404 (see `backend-exceptions`).
4. **One application service per use-case family.** Do not build a
   god-service. Split by cohesive use case: `BookAppointmentService`,
   `CancelAppointmentService`, `MoveAppointmentService` - each fulfils
   one inbound port, not five unrelated ones. Family, not method:
   `MoveAppointmentService` carries reschedule, confirm, complete,
   no-show and the drop-off's ready/promise, because those are one port
   (`MoveAppointmentUseCase`) and one reason to change. Cancellation is
   the one split out, because it owes the outbox something none of the
   others do - a message to the customer and the withdrawal of every
   reminder.
5. **I/O plumbing is its own class at the edge.** An outbound adapter
   (`AppointmentSqlRepository`, the worker's `SmtpNotificationChannel`)
   shuttles bytes and maps rows/responses. It makes no business decision.
   The service
   decides; the adapter transports. Keep persistence mapping, and the
   SQL text itself, out of the application service.
6. **Cross-cutting concerns are not the class's job.** Transactions,
   audit, tracing, metrics, `TenantContext` resolution, idempotency and
   rate limiting are CDI interceptors or connection-level hooks (see
   `cdi-interceptors`, `multi-tenant-rls`), not code sprinkled into the
   service. Logging is one of them: an application service holds **no
   `Logger` field and makes no log call**. It reads as pure
   orchestration, and the observability comes from the interceptor that
   wraps it (see `pii-masking-logging`).
7. **Name the responsibility, not the layer.** A class that writes to
   the outbox is a `*Publisher`; one that maps DTO↔domain is a
   `*Mapper`; one that validates is a `*Validator`; one that turns
   availability rules into bookable slots is a `SlotCalculator`. If you
   cannot name the single responsibility, the class has more than one.

## Anti-patterns

- A `BookingService` that computes the slots, checks the PRO plan quota,
  persists the appointment, renders the reminder text, and sends the SMS
  → rule 1. Split into `BookAppointmentService`, `scheduling`'s
  `CalculateSlotsUseCase`, a notifications row written in the same
  transaction, and the notification-worker that drains it. The plan quota
  has nowhere to go yet and must not be given a home inside booking:
  `billing` is an empty module and `CheckEntitlementUseCase` was never
  built, so do not import it. When the quota arrives it is billing's own
  inbound port, not a branch in the booking path.
- `appointment.setStatus(CONFIRMED)` after an `if` on the current status,
  relying on dirty checking to flush → rule 3. Two concurrent requests
  both pass the `if`; the second write wins and the first is lost with
  no error anywhere. Make the precondition part of the `WHERE`.
- Ignoring what the `UPDATE` gives back → rule 3. Every transition
  statement carries `RETURNING`, so the repository hands up an
  `Optional<AgendaEntry>`: an empty one IS the refusal, and nothing else
  will tell you it happened.
- Slot arithmetic or status transitions written out again in the service
  while `BookedSlot` and `AppointmentStatus` sit unused → rule 2. Move
  the rule into the domain type that already exists for it.
- A service taking a Redis lock, an advisory lock or `SELECT FOR UPDATE`
  to stop a double booking → rule 2, and a hard prohibition: the
  `EXCLUDE USING gist` constraint owns that invariant. Duplicating it in
  the service gives two sources of truth and neither is correct under
  concurrency (see `booking-integrity`).
- Trusting a client-supplied `ends_at` or duration instead of deriving
  the slot from the appointment's own frozen duration → rule 2; the
  domain owns the duration, the request body does not.
- Repricing an appointment while moving it → rule 2. `service_name`,
  `customer_price_amount_minor`, `customer_price_currency`,
  `duration_minutes` and the two buffer columns were frozen at booking,
  and the migration says why in as many words: changing the offering
  later never moves what an existing appointment blocks. The catalogue
  may have changed since; the move re-derives a window, it does not
  re-derive a bill.
- Planning new reminders without cancelling the obsolete ones → rule 1
  hiding a bug: the customer gets a reminder for a time that no longer
  exists. Cancel then plan, in the same transaction (see
  `outbox-messaging`).
- `@Transactional` orchestration mixed with `entityManager` queries and
  `problem+json` building in one bean → rules 5 and 6. Separate the
  adapter, and let the exception mapper build the RFC 7807 body.
- A `private static final Logger LOG` in an application service, or a
  `LOG.info("booking appointment …")` between two orchestration steps →
  rule 6. The interceptor emits `appointment.booked` with the
  correlation id; the service says nothing.
- `AppointmentManager` / `SlotHelper` / `BillingUtil` doing several
  things → rename to a precise responsibility: `*Repository`,
  `*Calculator`, `*Publisher`, `*Validator`, `*Mapper` (rule 7).
- A single `catch` that logs, masks the customer phone number, records a
  metric, and maps to an HTTP status → those are four interceptors' jobs,
  not the method's (rule 6).

## Minimal correct example

Rescheduling an appointment, each class owning exactly one concern:

```java
// domain - what can be settled without the row. Framework-free.
public enum AppointmentStatus {
    PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW;

    /** Asserted exhaustively in a test with no database. NOT the runtime
     *  authority: two racers would both pass this and both then write. */
    public boolean canBecome(AppointmentStatus next) { … }
}

/** The window a booking occupies, derived from the offering's own duration
 *  and buffers rather than from anything the client sent - a client sends a
 *  start, everything else follows, so it cannot shrink what it blocks.
 *  blockedFrom / blockedUntil are ordinary columns computed here; only
 *  blocked_range is generated by PostgreSQL, and
 *  ck_appointments_block_derived re-derives the pair rather than trusting
 *  the statement to have done it. */
public record BookedSlot(Instant startsAt, Instant endsAt,
                         Instant blockedFrom, Instant blockedUntil,
                         int bufferBeforeMinutes, int bufferAfterMinutes) {

    public static BookedSlot from(Instant startsAt, Duration duration,
                                  Duration bufferBefore, Duration bufferAfter) { … }
}
```

```java
// outbound port - one conditional statement per transition, and the row it
// gives back IS the outcome
public interface AppointmentStateRepository {

    Optional<AgendaEntry> reschedule(AppointmentId id, BookedSlot slot,
                                     Optional<StaffId> staffId, Instant at);

    /** Asked before the move rather than left to the composite foreign key,
     *  so an unknown chair is a 404 and not a 500 naming a constraint. */
    boolean activeStaffExists(StaffId staffId);

    /** Just enough to phrase a refusal, and read only once a statement has
     *  found nothing. Empty when the row does not exist OR is not the
     *  caller's - RLS makes those one answer, deliberately. */
    Optional<AppointmentSnapshot> snapshotOf(AppointmentId id);
}
```

```java
// application - one attempt, in its own transaction. Orchestrates only:
// no SQL, no gateway code, no Logger field.
@ApplicationScoped
public class RescheduleAttempt {

    private final AppointmentStateRepository appointments;  // outbound port
    private final LookupServiceOfferingUseCase offerings;   // catalog's port
    private final CalculateSlotsUseCase slots;              // scheduling's port
    private final NotificationOutboxPort outbox;            // outbound port
    private final BookingNotifications notifications;
    private final Clock clock;

    // constructor injection, one collaborator per concern

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public AgendaEntry once(AppointmentId id, Instant newStartsAt,
                            Optional<StaffId> newStaffId) {
        AppointmentSnapshot current = appointments.snapshotOf(id)
                .orElseThrow(() -> new AppointmentNotFoundException(id.value()));
        if (!MOVABLE.contains(current.status())) {
            throw new InvalidStateTransitionException(current.status(), current.status());
        }

        StaffId target = newStaffId.orElse(current.staffId());
        if (newStaffId.isPresent() && !appointments.activeStaffExists(target)) {
            throw new UnknownStaffException(target.value());
        }

        // recomputed from the service the appointment already carries; the
        // client sends a start and nothing else about time
        BookableOffering offering = offerings.requireBookable(current.serviceOfferingId());
        BookedSlot moved = BookedSlot.from(newStartsAt, offering.duration(),
                                           offering.bufferBefore(), offering.bufferAfter());

        // the friendly answer, not the guarantee
        if (!slots.isWithinAvailability(newStartsAt,
                                        slotRequest(target, offering, newStartsAt))) {
            throw new SlotOutsideAvailabilityException(newStartsAt,
                    "outside the provider's declared availability");
        }

        // and here is the guarantee. A 23P01 from the exclusion constraint is
        // translated in the adapter and surfaces as SlotUnavailableException
        // -> 409, exactly as a first booking's would
        AgendaEntry entry = appointments.reschedule(id, moved, newStaffId, clock.instant())
                .orElseThrow(() -> new InvalidStateTransitionException(
                        current.status(), AppointmentStatus.PENDING));

        // same transaction: retract what is now wrong before planning what is
        // right, or the customer is reminded of a time that no longer exists
        outbox.cancelPending(id);
        notifications.planReschedule(entry);

        return entry;
    }
}
```

```java
// application - the retry, and nothing else. Deliberately NOT @Transactional:
// a deadlock leaves the attempt's transaction rollback-only, so a retry inside
// it would fail on its first statement. Its own class for its own reason to
// change.
@ApplicationScoped
public class MoveAppointmentService implements MoveAppointmentUseCase {

    @Override
    public AgendaEntry reschedule(AppointmentId id, Instant newStartsAt,
                                  Optional<StaffId> staff) {
        for (int attempt = 0; attempt <= MAX_DEADLOCK_RETRIES; attempt++) {
            try {
                return rescheduleAttempt.once(id, newStartsAt, staff);
            } catch (TransientBookingConflictException e) {
                if (attempt == MAX_DEADLOCK_RETRIES) {
                    throw new BookingContendedException(newStartsAt);
                }
            }
        }
        throw new BookingContendedException(newStartsAt);
    }
}
```

```sql
-- inside AppointmentStateSqlRepository.reschedule; the service never sees
-- this text. buffer_before_minutes / buffer_after_minutes and the price
-- columns are frozen and absent from the SET list, so
-- ck_appointments_block_derived still holds and the bill does not move.
UPDATE appointments
   SET starts_at     = :startsAt,
       ends_at       = :endsAt,
       blocked_from  = :blockedFrom,
       blocked_until = :blockedUntil,
       -- COALESCE, so a move naming no chair leaves the row on the one it
       -- has. The chair changes in THIS statement and not a second one: the
       -- exclusion constraint keys on staff_id, and releasing the old
       -- resource before taking the new one opens a window a third booking
       -- fits into.
       staff_id      = COALESCE(CAST(:staffId AS uuid), staff_id),
       -- re-derived from the turnaround frozen at booking: a promise
       -- anchored to a handover that has moved is not a promise
       ready_by      = CASE WHEN turnaround_hours IS NULL THEN NULL
                            ELSE CAST(:endsAt AS timestamptz)
                                 + make_interval(hours => turnaround_hours)
                       END,
       version       = version + 1,
       updated_at    = :at
 WHERE id     = :id
   AND status IN ('PENDING','CONFIRMED')
RETURNING id, starts_at, ends_at, status, service_name, …
```

The domain derives the window, PostgreSQL holds the exclusion invariant and
the precondition, the service only orchestrates, the repository does I/O, and
audit/tracing/tenant/logging are interceptors and connection hooks elsewhere.

## Sibling skills

- `backend-architecture` - the four layers each responsibility lives in.
- `backend-naming` - suffixes that make the single responsibility readable,
  and why the insert port method is `insertIfAbsent`.
- `backend-di` - injecting one collaborator per concern.
- `backend-exceptions` - `InvalidStateTransitionException` and
  `AppointmentNotFoundException`, the two a refused transition resolves to,
  and why zero affected rows never throws by itself.
- `cdi-interceptors` - where cross-cutting effects go instead of the class.
- `pii-masking-logging` - the interceptor that logs so the service does not.
- `money-currency` - why the price frozen at booking never moves again.
- `booking-integrity` - the invariant the database owns, not the service.
- `outbox-messaging` - cancelling obsolete notifications and planning new
  ones in the same transaction.
- `temporal-modelling` - slot arithmetic belongs to the domain, with an
  injected clock.
