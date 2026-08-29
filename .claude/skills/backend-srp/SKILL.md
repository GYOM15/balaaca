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
- Writing a state transition — the moment where "read, decide in Java,
  save" quietly becomes two responsibilities and one race.
- Tempted to name something `*Manager`, `*Helper`, `*Util`, `*Processor`
  — a smell unless it is a genuinely stateless pure function.

## The rules

1. **One class = one reason to change.** If you describe it with "and"
   — "computes the slot *and* checks the plan quota *and* saves the
   appointment *and* sends the SMS" — split it. Each of those is a
   distinct concern with a distinct reason to change.
2. **Aggregate behavior lives in the domain, not the service.** Invariant
   checks, state transitions and the money math belong on the aggregate
   (`Appointment.confirm()`, `Appointment.cancel(reason)`,
   `Appointment.reschedule(newStartsAt, clock)`). The application service
   orchestrates; it does not re-implement the rules the domain owns.
   Money logic — notably `customerPrice()`, frozen onto the appointment
   at booking time — stays EXPLICIT in the domain, never smuggled into
   an interceptor or a mapper. Where the invariant is owned by
   PostgreSQL, as with the no-double-booking exclusion constraint, the
   service does not re-implement it either (see `booking-integrity`).
3. **A state transition is ONE conditional UPDATE, never a
   read-modify-write.** Checking the status in Java and then letting
   Hibernate dirty-check the change is two responsibilities pretending
   to be one, and it is wrong under concurrency: two requests both read
   `PENDING`, both pass the Java check, and the second write silently
   overwrites the first. The domain check stays — it produces a precise,
   testable error — but the AUTHORITY is a single statement whose
   `WHERE` clause carries the precondition:
   `UPDATE … WHERE id = :id AND status IN (…) AND version = :expected`.
   The affected-row count is checked; zero means someone else got there
   first and raises `AppointmentConflictException` (409). Zero rows do
   not throw on their own — under RLS a write to another tenant's row
   also affects zero rows in silence (see `backend-exceptions`).
4. **One application service per use-case family.** Do not build a
   god-service. Split by cohesive use case: `BookAppointmentService`,
   `CancelAppointmentService`, `RescheduleAppointmentService` — each
   fulfils one inbound port, not five unrelated ones.
5. **I/O plumbing is its own class at the edge.** An outbound adapter
   (`AppointmentPanacheRepository`, `TwilioSmsAdapter`) shuttles bytes
   and maps rows/responses. It makes no business decision. The service
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
  → rule 1. Split into `BookAppointmentService`, `scheduling`'s slot
  domain service, billing's `CheckEntitlementUseCase`, a notifications
  row written in the same transaction, and the notification-worker that
  drains it.
- `appointment.setStatus(CONFIRMED)` after an `if` on the current status,
  relying on dirty checking to flush → rule 3. Two concurrent requests
  both pass the `if`; the second write wins and the first is lost with
  no error anywhere. Make the precondition part of the `WHERE`.
- Ignoring the return value of an `UPDATE`/`executeUpdate()` → rule 3;
  the affected-row count IS the outcome of the operation.
- Slot arithmetic or status transitions living in the service while
  `Appointment` is an anemic data bag → rule 2. Move the rule onto the
  aggregate.
- A service taking a Redis lock, an advisory lock or `SELECT FOR UPDATE`
  to stop a double booking → rule 2, and a hard prohibition: the
  `EXCLUDE USING gist` constraint owns that invariant. Duplicating it in
  the service gives two sources of truth and neither is correct under
  concurrency (see `booking-integrity`).
- Trusting a client-supplied `ends_at` or duration instead of deriving
  the slot from the appointment's own frozen duration → rule 2; the
  domain owns the duration, the request body does not.
- Re-reading the `ServiceOffering` during a reschedule to recompute the
  duration or the price → rule 2. Duration, buffers and `customerPrice()`
  were frozen at booking; the catalogue may have changed since, and
  moving an appointment must never reprice or re-length it.
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
// domain — owns the state machine and the derived window. Framework-free.
public final class Appointment {

    private final AppointmentId id;
    private final Duration duration;        // frozen at booking
    private final Duration bufferBefore;    // frozen at booking
    private final Duration bufferAfter;     // frozen at booking
    private final Money customerPrice;      // frozen at booking
    private AppointmentStatus status;
    private TimeSlot slot;
    private long version;

    public AppointmentRescheduled reschedule(Instant newStartsAt, Clock clock) {
        if (status != PENDING && status != CONFIRMED) {
            throw new InvalidStateTransitionException(id, status, "RESCHEDULE");
        }
        if (!newStartsAt.isAfter(clock.instant())) {
            throw new SlotOutsideAvailabilityException(newStartsAt);
        }
        TimeSlot previous = this.slot;
        // derived from THIS appointment's frozen duration; the catalogue is
        // not consulted and customerPrice never moves
        this.slot = TimeSlot.of(newStartsAt, newStartsAt.plus(duration));
        return new AppointmentRescheduled(id, previous, slot, blockedWindow());
    }

    /** blocked_from / blocked_until are ordinary columns the application
     *  computes; only blocked_range is generated by PostgreSQL. */
    public BlockedWindow blockedWindow() {
        return new BlockedWindow(slot.startsAt().minus(bufferBefore),
                                 slot.endsAt().plus(bufferAfter));
    }
}
```

```java
// outbound port — states the semantics, returns the outcome
public interface AppointmentRepository {

    Appointment require(AppointmentId id);   // miss -> 404 RESOURCE_NOT_FOUND

    /** One conditional UPDATE. Returns the affected row count. */
    int applyReschedule(AppointmentId id, long expectedVersion,
                        TimeSlot slot, BlockedWindow window);
}
```

```java
// application — orchestrates only; no SQL, no gateway code, no logging
@ApplicationScoped
public class RescheduleAppointmentService
        implements RescheduleAppointmentUseCase {

    private final AppointmentRepository appointments;   // outbound port
    private final OutboxEventPublisher outbox;          // outbound port
    private final Clock clock;

    public RescheduleAppointmentService(AppointmentRepository appointments,
                                        OutboxEventPublisher outbox,
                                        Clock clock) {
        this.appointments = appointments;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void reschedule(AppointmentId id, Instant newStartsAt) {
        Appointment appointment = appointments.require(id);  // RLS-scoped
        AppointmentRescheduled event =
                appointment.reschedule(newStartsAt, clock);

        // the domain check above produces the precise error; THIS statement
        // is what makes it true under concurrency. 23P01 from the exclusion
        // constraint surfaces as SlotUnavailableException -> 409: the staff
        // member is the one already on the appointment, so the client named it
        int updated = appointments.applyReschedule(
                id, appointment.version(), event.newSlot(),
                event.blockedWindow());
        if (updated == 0) {
            throw new AppointmentConflictException(id);   // lost update -> 409
        }

        // same transaction: retract what is now wrong before planning what is
        // right, or the customer is reminded of a time that no longer exists
        outbox.cancelPendingFor(id);
        outbox.record(event);   // reminder keys embed the new scheduled_at
    }
}
```

```sql
-- inside AppointmentPanacheRepository.applyReschedule; the service never
-- sees this text. buffer_before_minutes / buffer_after_minutes are frozen
-- and untouched, so ck_appointments_block_derived still holds.
UPDATE appointments
   SET starts_at     = :starts_at,
       ends_at       = :ends_at,
       blocked_from  = :blocked_from,
       blocked_until = :blocked_until,
       version       = version + 1,
       updated_at    = now()
 WHERE id      = :id
   AND status  IN ('PENDING', 'CONFIRMED')
   AND version = :expected_version
```

The domain holds the rule, PostgreSQL holds the exclusion invariant and the
precondition, the service only orchestrates, the repository does I/O, and
audit/tracing/tenant/logging are interceptors and connection hooks elsewhere.

## Sibling skills

- `backend-architecture` — the four layers each responsibility lives in.
- `backend-naming` — suffixes that make the single responsibility readable,
  and why the insert port method is `insertIfAbsent`.
- `backend-di` — injecting one collaborator per concern.
- `backend-exceptions` — `AppointmentConflictException` for the lost update,
  and why zero affected rows never throws by itself.
- `cdi-interceptors` — where cross-cutting effects go instead of the class.
- `pii-masking-logging` — the interceptor that logs so the service does not.
- `money-currency` — why the frozen `customerPrice()` stays in the domain.
- `booking-integrity` — the invariant the database owns, not the service.
- `outbox-messaging` — cancelling obsolete notifications and planning new
  ones in the same transaction.
- `temporal-modelling` — slot arithmetic belongs to the domain, with an
  injected clock.
