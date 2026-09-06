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
   The shape is `appointment:{uuid}:{KIND}:{owed_for_epoch_seconds}` - for
   example `appointment:9f1c…:REMINDER:1772445600`. That is deterministic (a
   replayed transaction recomputes the identical key and the UNIQUE index
   absorbs it) and collision-free across reschedules (the new time is a new
   instant, so the re-planned reminder is a new row, while the obsolete one is
   cancelled by rule 9). There is no plan-version column and no counter:
   anything that has to be incremented is state that two racing transactions
   can disagree about.

   **There is no `REMINDER_24H` kind, and there never was one to delete.** The
   day-before and the two-hour reminders are both `REMINDER`, told apart by the
   instant they are owed for. A kind per lead time would buy a new enum
   constant and a new CHECK migration every time somebody changes a schedule,
   and the key already distinguishes the two for free. The lead times are
   constants in `BookingNotifications`, not kinds.

   **`owed_for` and `scheduled_at` are two different instants, and only the
   first is in the key.** `owed_for` is the domain moment the message exists
   for - the appointment's start, or its start minus the reminder's lead time -
   and it is never a clock read, because a replay that read a fresh clock would
   compute a different key and send twice. `scheduled_at` is only when the
   worker may send: for an immediate message it is simply now. A retry does not
   touch it either - the backoff moves `retry_after_at` and leaves the due
   instant alone. Delivery is not identity, so it stays out of the key. `owed_for`
   is an input to the key and never became a column; the row keeps
   `scheduled_at`.

   Nothing carries the key to the channel as an idempotency key, either.
   Neither the WhatsApp Graph API nor SMTP takes one, so a crash between the
   acknowledgement and the `SENT` update costs a real duplicate, not a
   suppressed one. What the key does buy is the larger win: it stops a
   notification being *planned* twice, which is by far the likelier mistake.
9. **Cancelling or rescheduling an appointment cancels its pending
   notifications and plans the new ones in the same transaction.** A cancelled
   appointment whose `REMINDER` is still `PENDING` will text a customer
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
    `retry_after_at` forward, and leaves the row `PENDING`; `scheduled_at` is
    when the message became due and a retry has no business rewriting it. At
    the cap - the row's own `max_attempts`, a column rather than a constant, so
    one stubborn recipient can be given a different budget without a
    deployment - the row becomes `DEAD` and is alerted on, never retried
    forever. No retry loop
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
- Versioning the dedupe key (`…:REMINDER:v2`) or keeping a `plan_version`
  column → rule 8; a counter is state two racing transactions can disagree
  about, and the target instant already distinguishes the rows for free.
- Minting a `REMINDER_24H` kind, or any other kind named after a lead time →
  rule 8; two reminders of one kind are already told apart by the instant they
  are owed for, and the new constant costs a CHECK migration for nothing.
- Building `owed_for` from `clock.instant()` at planning time for a message
  that is owed at a domain instant → rule 8; the replayed transaction computes
  a different key and the customer gets two reminders. (`scheduled_at` from a
  clock read is fine and usual: an immediate message is due now.)
- The worker joining `appointments` and `customers` to fetch the phone
  number → rule 10; it widens the worker's privileges and sends a reminder
  built from data that has since changed.
- Retrying in a `while` loop inside the request, or retrying without a cap →
  rule 11; a dead channel becomes a thread leak and an infinite send.
- Writing the raw gateway response into `last_error`, or calling a masking
  helper inline in the drain service → rule 11; store a stable failure code
  and leave sanitising to the adapter and the log boundary.
- Rescheduling an appointment and leaving the old `REMINDER` `PENDING` →
  rule 9; the customer is reminded of the old time.
- Routing a `billing` entitlement check or a `scheduling` slot computation
  through the table → rule 1; those are in-process port calls.

## Minimal correct example

The outbox table (Flyway) - tenant-scoped, self-contained, deduped. The
composite foreign key works because `appointments` declares
`UNIQUE (provider_id, id)`; see `booking-integrity` for that table.

```sql
-- V010__create_notifications.sql   (owner: balaaca_migrator)
CREATE TABLE notifications (
    id             uuid PRIMARY KEY,
    provider_id    uuid NOT NULL,
    appointment_id uuid,                    -- nullable: not all are bookings
    recipient_kind varchar(20)  NOT NULL,   -- CUSTOMER | PROVIDER
    kind           varchar(40)  NOT NULL,   -- BOOKING_CONFIRMATION, REMINDER, …
    dedupe_key     varchar(200) NOT NULL UNIQUE,  -- intent + owed-for instant

    -- Both addresses travel, frozen at planning time, and preferred_channel
    -- (added by V049) says which was asked for. The worker cannot read the
    -- customer, so a row carrying only the chosen address would have nothing
    -- to fall back to when that transport has none.
    to_phone_e164     varchar(20),
    to_email          citext,
    preferred_channel varchar(20) NOT NULL, -- WHATSAPP | EMAIL   (V049)
    locale         varchar(10) NOT NULL DEFAULT 'fr',
    payload        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- variables, English keys

    -- Six, and nothing writes FAILED: a terminal failure is DEAD. FAILED
    -- survives as vocabulary the schema allows and no code has ever needed.
    status         varchar(20) NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','SENDING','SENT',
                                     'FAILED','DEAD','CANCELLED')),
    scheduled_at   timestamptz NOT NULL,    -- when it may go out, UTC
    retry_after_at timestamptz NOT NULL DEFAULT now(),  -- moved by the backoff
    attempts       int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts   int NOT NULL DEFAULT 6 CHECK (max_attempts > 0),
    channel_used   varchar(20),             -- the outcome, not the intention
    last_error     varchar(500),            -- stable failure code only
    sent_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    -- There is no claimed_at, and none was removed: the claim is the only
    -- statement that touches updated_at on a SENDING row, so its age IS the
    -- lease. A second timestamp would only be a second thing to keep in step.
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_notifications_destination
        CHECK (to_phone_e164 IS NOT NULL OR to_email IS NOT NULL),
    FOREIGN KEY (provider_id, appointment_id)
        REFERENCES appointments (provider_id, id) ON DELETE CASCADE
);

-- The claim filters on both instants, so the partial index carries both.
CREATE INDEX ix_notifications_due ON notifications (scheduled_at, retry_after_at)
    WHERE status = 'PENDING';
CREATE INDEX ix_notifications_appointment ON notifications (appointment_id)
    WHERE appointment_id IS NOT NULL;
-- No lease index was ever built: the reaper reads only rows left SENDING, a
-- set that is empty except after a crash.
```

The RLS below is `V013`'s, not this migration's: policies and grants for every
tenant table are declared together there. It belongs here all the same, because
the table and the policies only make sense read as one thing.

```sql
-- V013__enable_row_level_security.sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE  ROW LEVEL SECURITY;

-- The business API sees only its own provider's rows. app_current_provider()
-- (V001) is exactly rule 6's null-safe form behind a name: an unbound
-- connection yields NULL, which matches nothing, instead of 42704. No TO
-- clause - V013 writes this one in a loop over every tenant table - so it
-- binds every role. Policies are OR'd, so the two below widen what their own
-- role may see rather than replacing this one.
CREATE POLICY notifications_tenant ON notifications
    USING      (provider_id = app_current_provider())
    WITH CHECK (provider_id = app_current_provider());

-- The worker drains every provider. Not BYPASSRLS: a policy naming its own
-- role, which is granted these two verbs on this one table and nothing else.
-- It never sets app.provider_id, and this policy never reads it.
CREATE POLICY notifications_worker ON notifications
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

    private final AppointmentStateRepository appointments;
    private final NotificationOutboxPort outbox;        // appends rows, no network
    private final BookingNotifications notifications;   // decides what is owed
    private final Clock clock;

    public CancelAppointmentService(AppointmentStateRepository appointments,
                                    NotificationOutboxPort outbox,
                                    BookingNotifications notifications,
                                    Clock clock) {
        this.appointments = appointments;
        this.outbox = outbox;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Override
    @Transactional(Transactional.TxType.REQUIRED)
    public AgendaEntry cancel(AppointmentId id, Optional<String> reason) {
        AgendaEntry cancelled = appointments.cancel(id, reason, clock.instant())
                .orElseThrow(() -> refusalFor(id));       // one conditional UPDATE

        // Same transaction: the reminder that is no longer owed is withdrawn,
        // and the notification that IS owed is planned. No channel is touched,
        // and nothing is logged from here.
        outbox.cancelPending(id);
        notifications.planCancellation(cancelled);
        return cancelled;
    }
}
```

The dedupe key is intent plus the instant the message is owed for - no
counter, no version:

```java
public record PlannedNotification(AppointmentId appointmentId,
                                  NotificationKind kind,
                                  NotificationRecipient recipient,  // CUSTOMER | PROVIDER
                                  Optional<String> toPhoneE164,     // frozen at planning
                                  Optional<String> toEmail,         // frozen at planning
                                  ContactChannel preferredChannel,
                                  String locale,
                                  Map<String, String> payload,
                                  Instant owedFor,       // identity: in the key
                                  Instant scheduledAt) { // delivery: out of it

    /**
     * Deterministic: a replayed transaction recomputes the identical key and
     * UNIQUE (dedupe_key) absorbs it. Collision-free across reschedules: a new
     * time is a new instant, hence a new row, while the obsolete row is
     * cancelled in the same unit of work. No channel in it either - how a
     * message travels is delivery, so a key that moved with it would let one
     * appointment send the same confirmation twice.
     */
    public String dedupeKey() {
        return "appointment:" + appointmentId.value()
             + ":" + kind.name()
             + ":" + owedFor.getEpochSecond();
    }
}

// In BookingNotifications, which decides what a booking owes. Both reminders
// are kind REMINDER; what tells them apart is owedFor, and that comes from the
// appointment and never from a clock read.
private static Optional<PlannedNotification> reminder(AppointmentId id, Instant startsAt,
                                                      Duration before, Instant now, …) {
    Instant owedFor = startsAt.minus(before);
    if (!owedFor.isAfter(now)) {
        // A booking taken inside the lead time owes no reminder. Writing one
        // anyway makes the worker send it on the next drain, which is a
        // reminder about an appointment the customer is already walking to.
        return Optional.empty();
    }
    return Optional.of(new PlannedNotification(id, NotificationKind.REMINDER,
            NotificationRecipient.CUSTOMER, …, owedFor, owedFor));
}
```

The worker claims a batch, commits the claim, then sends:

```sql
-- Claim: one short transaction. SKIP LOCKED means replicas never collide.
-- Both instants are filtered: scheduled_at is when the message became due,
-- retry_after_at is where the backoff pushed a failed attempt.
UPDATE notifications
   SET status = 'SENDING', updated_at = now()   -- updated_at IS the lease
 WHERE id IN (
       SELECT id
         FROM notifications
        WHERE status = 'PENDING'
          AND scheduled_at   <= now()
          AND retry_after_at <= now()
        ORDER BY scheduled_at
        LIMIT :batchSize
        FOR UPDATE SKIP LOCKED)
RETURNING id, provider_id, kind, to_phone_e164, to_email,
          preferred_channel, locale, payload::text, dedupe_key, attempts;
```

```java
@ApplicationScoped
public class NotificationDrainJob {

    private static final int BATCH = 50;

    // Scheduled entry point: no request, therefore no TenantContext and no
    // app.provider_id on this connection. The worker's own RLS policy admits
    // the rows, and the row itself carries everything the send needs.
    @Scheduled(every = "{balaaca.notification.drain-interval:5s}",
               concurrentExecution = ConcurrentExecution.SKIP)
    public void drain() {
        for (ClaimedNotification n : outbox.claimDue(BATCH)) {
            // provider_id is an operational identifier and goes to the MDC raw;
            // the recipient never does.
            MDC.put("provider_id", n.providerId().toString());
            try {
                dispatch(n);
            } finally {
                MDC.remove("provider_id");
            }
        }
    }

    private void dispatch(ClaimedNotification n) {
        try {
            // The router answers with the transport the message actually went
            // out on, which is not always the one the recipient asked for: a
            // choice with no address behind it falls back to the other, and
            // channel_used has to record what happened, not what was wanted.
            Channel used = router.dispatch(n);
            outbox.markSent(n.id(), used, clock.instant());   // only after the ack
        } catch (UndeliverableException e) {
            // No transport has an address, so no later attempt can differ.
            // Dead now rather than in an hour and sixteen wasted tries.
            outbox.markDead(n.id(), e.failureCode());
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
-- retry_after_at, never scheduled_at: scheduled_at is when the message became
-- due, and a retry has no business rewriting that. The cap is the row's own
-- max_attempts rather than a bound constant, and RETURNING is how the caller
-- learns this attempt was the last one - asking afterwards would be asking a
-- row another worker may have moved.
UPDATE notifications
   SET attempts       = attempts + 1,
       status         = CASE WHEN attempts + 1 >= max_attempts
                             THEN 'DEAD' ELSE 'PENDING' END,
       retry_after_at = :nextAttemptAt,
       last_error     = :failureCode,
       updated_at     = now()
 WHERE id = :id
RETURNING status;

-- Reaper: a worker that died mid-send leaves a row SENDING for ever. The lease
-- is updated_at, because the claim is the only statement that sets it on a
-- SENDING row. At-least-once is the contract and nothing absorbs the replay -
-- no channel here takes an idempotency key - so the customer may read the
-- message twice. The trade is deliberate: a duplicate is an annoyance, a
-- confirmation that never arrives is a customer outside a closed salon.
UPDATE notifications
   SET status = 'PENDING', updated_at = now()
 WHERE status = 'SENDING'
   AND updated_at < now() - make_interval(secs => CAST(:leaseSeconds AS double precision));
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
