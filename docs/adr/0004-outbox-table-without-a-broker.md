# ADR-0004 - An outbox table drained by a worker, with no broker

Status: Accepted
Supersedes the transport rule of the inherited `outbox-messaging` skill.

## Context

A booking has to trigger effects its transaction cannot own: an immediate
confirmation, a reminder at 24 h, a reminder at 2 h, an alert to the provider.
Those go out over WhatsApp, SMS or e-mail: slow, fallible network calls.

Two classic traps:

- sending inside the booking's HTTP request: the customer waits on an external
  provider, and a failed send fails an otherwise valid booking;
- writing to the database then publishing to a broker: two systems that cannot
  commit together, so either a lost event or a phantom one.

The inherited skill required an outbox relayed to Redpanda.

## Decision

The transactional outbox is kept. The **broker is dropped**.

The `notifications` table **is** the outbox. Rows are inserted in the **same
transaction** as the appointment. The `notification-worker`, a separate
deployable, drains them:

```sql
SELECT ... FROM notifications
WHERE status = 'PENDING' AND scheduled_at <= now() AND next_attempt_at <= now()
ORDER BY scheduled_at
FOR UPDATE SKIP LOCKED
LIMIT 50
```

`FOR UPDATE SKIP LOCKED` allows several concurrent workers with no double send
and no broker configuration. A row moves to `SENT` **only after** the channel
acknowledges it.

Every other rule of the skill stands: idempotency through a UNIQUE `dedupe_key`,
at-least-once delivery and therefore systematic deduplication, exponential
backoff with jitter, a maximum number of attempts then the `DEAD` state, and
cancellation of pending notifications when an appointment is cancelled or moved,
in the same transaction.

The worker connects with its own least-privilege PostgreSQL role.

## Consequences

Positive: zero extra infrastructure component to operate, monitor and back up.
Transactional safety is identical to that of a relayed outbox. Debugging is done
with a SQL query.

Negative: polling introduces a latency equal to its interval. The table grows and
needs finished rows purged. A fan-out to several independent consumers would take
work the broker would have given away.

## Revisit when

Volume outgrows what polling absorbs comfortably, or a second consumer
independent of the same events appears. The table then becomes a producer towards
a broker without the business code changing: it already writes its event in the
same place.
