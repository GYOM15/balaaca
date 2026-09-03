---
name: outbox-messaging
description: Use when a state change must produce an effect that leaves the process - a confirmation, a reminder, a staff alert - or when writing or reviewing the notifications table, its dedupe key, the notification-worker drain loop, its retry and backoff, its database role and RLS policies, or a PR that calls an SMS, email or HTTP client from inside a @Transactional business method.
---

# outbox-messaging

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Side effects that must survive a business transaction travel through the
**`notifications` table, which IS the transactional outbox**. The state
change and its notification rows commit together in one DB transaction; a
separate deployable, `notification-worker`, drains them and talks to the
outside world. There is no Kafka and no Redpanda here: a broker is
deliberately deferred until volume justifies one, and the table already
gives the transactional safety that a broker would have been bought for.

## When to use

- A booking, cancellation, or reschedule must produce a confirmation, a
  reminder, or a staff alert - anything leaving the process.
- Any state change must trigger an effect the current transaction cannot
  own atomically (send an SMS, send an email, push a reminder later).
- Writing or reviewing the `notification-worker` drain loop, its retry
  policy, its database role, or its RLS policies.
- Choosing or changing a `dedupe_key`, especially for a reminder that a
  reschedule moves.
- Reviewing a PR that calls an SMS/email client, an HTTP client, or any
  other network I/O from inside a `@Transactional` business method.

## The rules

1. **Core module to core module stays an in-process port call; only work
   that must outlive the transaction becomes a notification row.** `booking`
   asking `scheduling` for slots, or `billing` for a plan entitlement, is a
   plain Java call through the callee's inbound port - never a row, never a
   network hop. The table exists for effects that leave the process. All the
   classic outbox rules apply to it; only the transport differs.
2. **The notification row is written in the same transaction as the state
   change.** One `@Transactional` unit persists the `Appointment` **and** its
   `notifications` rows. Committing the appointment and inserting the
   notification afterwards is a dual write across two failure domains, even
   when both live in the same PostgreSQL instance.
3. **No network I/O ever happens inside a business transaction.** The
   application layer depends on a `NotificationOutboxPort` that only appends
   and cancels rows. No SMS gateway, no SMTP client, no webhook call inside
   `@Transactional` - a hung socket would hold a row lock and, on the booking
   path, an exclusion-constraint range with it.
4. **A separate deployable drains the table, with `SELECT … FOR UPDATE SKIP
   LOCKED`, under its own least-privilege database role.**
   `notification-worker` claims a batch, commits the claim, then sends. Two
   workers never fight over the same row. The worker role is **not** the
   application role, holds no `BYPASSRLS` and owns no table; it is granted
   `SELECT` and `UPDATE` on `notifications` and nothing else, and a dedicated
   RLS policy - written for that role by name - lets it see every provider's
   rows. Cross-tenant draining is a policy decision in SQL, not a privilege
   escape hatch.
5. **The worker never binds a tenant, and never reads a tenant table.**
   `TenantContext` is `@RequestScoped`, and a scheduled drain has no request:
   trying to bind it there either fails or, worse, leaves a stale value on a
   pooled thread. So the worker's connection never sets `app.provider_id`, and
   it does not need to - its own policy (rule 4) is what admits the rows. It
   resolves nothing: the row already carries everything the send needs
   (rule 10). For observability it puts the row's `provider_id` into the MDC
   raw - an operational identifier, not PII - and never logs the recipient.
6. **Every RLS predicate on this table uses the null-safe form, and the owner
   gets its own policy.** Write
   `provider_id = nullif(current_setting('app.provider_id', true), '')::uuid`:
   without `missing_ok` an unset GUC raises `42704`, and `''::uuid` raises
   `22P02`, so a misconfigured connection would return `500`s instead of no
   rows. And because the table is `FORCE ROW LEVEL SECURITY`, its **owner** is
   subject to policies too: name the owning role (`balaaca_migrator`) and give
   it a maintenance policy, or a migration's backfill `UPDATE` will match zero
   rows, report success, and leave the data untouched.
7. **A row becomes `SENT` only after the channel acknowledges.** Marking
   before the ack silently loses messages: the send fails, the row says
   `SENT`, and nobody ever finds out. Ack first, mark second, in that order.
8. **Delivery is at-least-once, so everything dedupes on a UNIQUE
   `dedupe_key`, and the key embeds the instant the message is owed for.**
   The shape is `appointment:{uuid}:{TYPE}:{scheduled_at_epoch_seconds}` - for example
   `appointment:9f1c…:REMINDER_24H:1772445600`. That is deterministic (a
   replayed transaction recomputes the identical key and the UNIQUE index
   absorbs it) and collision-free across reschedules (the new time is a new
   instant, so the re-planned reminder is a new row, while the obsolete one is
   cancelled by rule 9). There is no plan-version column and no counter:
   anything that has to be incremented is state that two racing transactions
   can disagree about. For this to hold, `scheduled_at` must be derived from
   domain instants - `starts_at` minus 24 hours, the recorded cancellation
   instant - never from a fresh clock read at planning time. The same key is
   passed to the channel as its own idempotency key, so a crash between the
   send and the `SENT` update costs a suppressed duplicate, not a second SMS.
9. **Cancelling or rescheduling an appointment cancels its pending
   notifications and plans the new ones in the same transaction.** A cancelled
   appointment whose `REMINDER_24H` is still `PENDING` will text a customer
   about an appointment that no longer exists. Cancellation of the obsolete
   rows and insertion of the owed ones are part of the same unit of work as
   the state change.
10. **A notification row is a self-contained snapshot, never a pointer.** It
    carries the recipient (E.164 phone or email, as frozen at planning time),
    the locale, and the template variables under stable English keys. The
    worker never joins `appointments`, `customers`, or `service_offerings` - it could not anyway, since its role cannot read them. This is what makes
    rule 4's least privilege and rule 5's tenant-free worker possible, and it
    keeps a message truthful about the moment it was owed.
11. **Retry is exponential backoff with jitter, a bounded attempt count, and a
    terminal `DEAD` state.** A failure increments `attempts`, pushes
    `scheduled_at` forward, and leaves the row `PENDING`; at the cap the row
    becomes `DEAD` and is alerted on, never retried forever. No retry loop
    ever runs on a request thread. `last_error` holds a **stable failure code**
    produced by the channel adapter - not a provider payload, and not the
    result of a masking call sprinkled through business code. Sanitising is
    the adapter's and the log boundary's job.

## Anti-patterns

- `appointments.persist(a); smsClient.send(...)` in one service method → the
  gateway is down after commit and the confirmation is lost; the transaction
  rolls back after a successful send and the customer is told about a booking
  that does not exist. → Rules 2 and 3: write the row, let the worker send.
- Marking a row `SENT` before the channel acknowledges → rule 7; silently
  lost messages that no metric will ever show.
- Draining with a plain `SELECT … WHERE status = 'PENDING'` and no
  `SKIP LOCKED` → rule 4; two worker replicas claim the same row and the
  customer gets two SMS.
- Granting `BYPASSRLS` to the worker, or letting it reuse the application
  role → rule 4; a drain bug becomes a cross-tenant data breach.
- Binding `TenantContext` in the drain loop, or looping over providers and
  draining "per tenant" → rule 5; there is no request to scope it to, and the
  worker's policy already admits every row.
- `current_setting('app.provider_id')::uuid` in a policy, with no
  `missing_ok` and no `nullif` → rule 6; an unbound connection raises `42704`
  or `22P02` and the API answers `500` where it should answer nothing at all.
- `FORCE ROW LEVEL SECURITY` with no policy for the owning role → rule 6; the
  next backfill migration updates zero rows and says it worked.
- Versioning the dedupe key (`…:REMINDER_24H:v2`) or keeping a `plan_version`
  column → rule 8; a counter is state two racing transactions can disagree
  about, and the target instant already distinguishes the rows for free.
- Building `scheduled_at` from `clock.instant()` at planning time for a
  message that is owed at a domain instant → rule 8; the replayed transaction
  computes a different key and the customer gets two reminders.
- The worker joining `appointments` and `customers` to fetch the phone
  number → rule 10; it widens the worker's privileges and sends a reminder
  built from data that has since changed.
- Retrying in a `while` loop inside the request, or retrying without a cap →
  rule 11; a dead channel becomes a thread leak and an infinite send.
- Writing the raw gateway response into `last_error`, or calling a masking
  helper inline in the drain service → rule 11; store a stable failure code
  and leave sanitising to the adapter and the log boundary.
- Rescheduling an appointment and leaving the old `REMINDER_24H` `PENDING` →
  rule 9; the customer is reminded of the old time.
- Routing a `billing` entitlement check or a `scheduling` slot computation
  through the table → rule 1; those are in-process port calls.

## Minimal correct example

The outbox table (Flyway) - tenant-scoped, self-contained, deduped. The
composite foreign key works because `appointments` declares
`UNIQUE (provider_id, id)`; see `booking-integrity` for that table.

```sql
-- V021__create_notifications.sql   (owner: balaaca_migrator)
CREATE TABLE notifications (
    id             uuid        PRIMARY KEY,
    provider_id    uuid        NOT NULL,
    appointment_id uuid,                   -- nullable: not all are bookings
    type           text        NOT NULL,   -- APPOINTMENT_CONFIRMED etc.
    channel        text        NOT NULL,   -- SMS, EMAIL
    recipient      text        NOT NULL,   -- E.164 or email, frozen
    locale         text        NOT NULL,   -- resolves the i18n catalogue key
    variables      jsonb       NOT NULL,   -- template variables, English keys
    dedupe_key     text        NOT NULL,   -- intent + target instant (rule 8)
    -- status: PENDING | SENDING | SENT | CANCELLED | DEAD
    status         text        NOT NULL,
    attempts       int         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    scheduled_at   timestamptz NOT NULL,   -- the one due column, UTC
    claimed_at     timestamptz,            -- lease, for crash recovery
    sent_at        timestamptz,
    last_error     text,                   -- stable failure code only
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_notifications_dedupe UNIQUE (dedupe_key),
    CONSTRAINT fk_notifications_appointment
        FOREIGN KEY (provider_id, appointment_id)
        REFERENCES appointments (provider_id, id)
);

-- The drain path and the lease reaper each get their own partial index.
CREATE INDEX ix_notifications_due ON notifications (scheduled_at)
    WHERE status = 'PENDING';
CREATE INDEX ix_notifications_leased ON notifications (claimed_at)
    WHERE status = 'SENDING';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE  ROW LEVEL SECURITY;

-- The business API sees only its own provider's rows. nullif + missing_ok:
-- an unbound connection yields NULL, which matches nothing, instead of 42704.
CREATE POLICY notifications_tenant_isolation ON notifications
    FOR ALL TO balaaca_app
    USING      (provider_id
                = nullif(current_setting('app.provider_id', true), '')::uuid)
    WITH CHECK (provider_id
                = nullif(current_setting('app.provider_id', true), '')::uuid);

-- The worker drains every provider. Not BYPASSRLS: a policy naming its own
-- role, which is granted these two verbs on this one table and nothing else.
-- It never sets app.provider_id, and this policy never reads it.
CREATE POLICY notifications_worker_drain ON notifications
    FOR ALL TO balaaca_notification_worker
    USING (true) WITH CHECK (true);

-- FORCE RLS binds the OWNER too. Without this, a later migration's backfill
-- runs as balaaca_migrator, matches zero rows, and reports success.
CREATE POLICY notifications_maintenance ON notifications
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON notifications TO balaaca_notification_worker;
```

State change and notification rows in one transaction, through a port:

```java
@ApplicationScoped
public class CancelAppointmentService implements CancelAppointmentUseCase {

    private final AppointmentRepository appointments;
    private final NotificationOutboxPort outbox;   // appends rows, no network
    private final Clock clock;

    @Inject
    public CancelAppointmentService(AppointmentRepository appointments,
                                    NotificationOutboxPort outbox,
                                    Clock clock) {
        this.appointments = appointments;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void cancel(AppointmentId appointmentId, CancellationReason reason) {
        Appointment appointment = appointments.require(appointmentId);
        appointment.cancel(reason, clock.instant());          // state change

        // Same transaction: the reminder that is no longer owed is withdrawn,
        // and the notification that IS owed is planned. No channel is touched,
        // and nothing is logged from here.
        outbox.cancelPending(appointment.id());
        outbox.plan(PlannedNotification.forCancellation(appointment));
    }
}
```

The dedupe key is intent plus the instant the message is owed for - no
counter, no version:

```java
public record PlannedNotification(AppointmentId appointmentId,
                                  NotificationType type,
                                  Channel channel,
                                  String recipient,   // E.164 or email, frozen
                                  Locale locale,
                                  Map<String, String> variables,
                                  Instant scheduledAt) {

    /**
     * Deterministic: a replayed transaction recomputes the identical key and
     * UNIQUE (dedupe_key) absorbs it. Collision-free across reschedules: a new
     * time is a new instant, hence a new row, while the obsolete row is
     * cancelled in the same unit of work.
     */
    public String dedupeKey() {
        return "appointment:" + appointmentId.value()
             + ":" + type.name()
             + ":" + scheduledAt.getEpochSecond();
    }

    /** scheduledAt comes from the appointment, never a fresh clock read. */
    public static PlannedNotification reminder24h(Appointment appointment) {
        return new PlannedNotification(
                appointment.id(), NotificationType.REMINDER_24H, Channel.SMS,
                appointment.customerPhone().e164(), appointment.locale(),
                variablesOf(appointment),
                appointment.startsAt().minus(24, ChronoUnit.HOURS));
    }
}
```

The worker claims a batch, commits the claim, then sends:

```sql
-- Claim: one short transaction. SKIP LOCKED means replicas never collide.
UPDATE notifications
   SET status = 'SENDING', claimed_at = now()
 WHERE id IN (
       SELECT id
         FROM notifications
        WHERE status = 'PENDING'
          AND scheduled_at <= now()
        ORDER BY scheduled_at
        LIMIT :batchSize
        FOR UPDATE SKIP LOCKED)
RETURNING id, provider_id, type, channel, recipient, locale, variables,
          dedupe_key, attempts;
```

```java
@ApplicationScoped
public class NotificationDrainJob {

    private static final int BATCH = 50;

    // Scheduled entry point: no request, therefore no TenantContext and no
    // app.provider_id on this connection. The worker's own RLS policy admits
    // the rows, and the row itself carries everything the send needs.
    @Scheduled(every = "5s", concurrentExecution = ConcurrentExecution.SKIP)
    void drain() {
        for (ClaimedNotification n : outbox.claimDue(BATCH)) {
            // provider_id is an operational identifier and goes to the MDC raw;
            // the recipient never does.
            try (var scope = LogContext.with("provider_id", n.providerId())) {
                dispatch(n);
            }
        }
    }

    private void dispatch(ClaimedNotification n) {
        try {
            // The dedupe key doubles as the channel's idempotency key, so a
            // crash between the ack and markSent costs a suppressed duplicate.
            channels.forChannel(n.channel())
                    .send(n.recipient(), messages.render(n), n.dedupeKey());
            outbox.markSent(n.id(), clock.instant());   // only after the ack
        } catch (ChannelException e) {
            // failureCode() is a stable code minted by the channel adapter -
            // no provider payload, no masking call inside this method.
            outbox.scheduleRetry(n.id(),
                    backoff.nextAttemptAt(n.attempts(), clock.instant()),
                    e.failureCode());
        }
    }
}
```

Backoff with jitter, and the cap that turns a row `DEAD`:

```java
public Instant nextAttemptAt(int attempts, Instant now) {
    long seconds = BASE_SECONDS << Math.min(attempts, MAX_EXPONENT);
    long jitter  = random.nextLong(seconds / 4 + 1);   // spread the retries
    return now.plusSeconds(seconds + jitter);
}
```

```sql
-- scheduleRetry: bounded attempts, terminal DEAD, stable failure code.
UPDATE notifications
   SET attempts     = attempts + 1,
       status       = CASE WHEN attempts + 1 >= :maxAttempts
                           THEN 'DEAD' ELSE 'PENDING' END,
       scheduled_at = :nextAttemptAt,
       claimed_at   = NULL,
       last_error   = :failureCode
 WHERE id = :id;

-- Reaper: a worker that died mid-send leaves a lease behind. At-least-once
-- is the contract, and the channel idempotency key absorbs the replay.
UPDATE notifications
   SET status = 'PENDING', claimed_at = NULL
 WHERE status = 'SENDING' AND claimed_at < now() - interval '5 minutes';
```

## Sibling skills

- `booking-integrity` - the appointment state machine that produces these
  rows, and the `appointments` table whose `UNIQUE (provider_id, id)` this
  foreign key needs; the exclusion constraint is exactly why no network call
  may sit inside the booking transaction.
- `idempotency-concurrency` - `SKIP LOCKED` claiming, the `UNIQUE`
  `dedupe_key`, and why at-least-once forces dedupe on both sides.
- `multi-tenant-rls` - `notifications` carries `provider_id` and is RLS
  FORCEd; the tenant GUC is bound on the connection for the API and left
  unbound for the worker, which gets a named policy and a least-privilege
  role, never `BYPASSRLS`.
- `cdi-interceptors` - why a `@RequestScoped` `TenantContext` and a
  `@Scheduled` drain cannot meet, and what runs where.
- `temporal-modelling` - `scheduled_at` is `timestamptz` in UTC, and a
  24-hour reminder is computed from the appointment's instant, not from a
  local wall clock.
- `backend-architecture` - why core-to-core is an in-process port call and
  only core-to-satellite leaves the process.
- `pii-masking-logging` - the recipient on a notification row is a phone
  number and is never logged; `provider_id` is logged raw; `last_error` holds
  a code, not a payload.
