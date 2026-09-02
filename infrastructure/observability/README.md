# Observability

The useful floor: metrics, a scraper, and one dashboard. No Alertmanager and no
alerting rules. On a Raspberry Pi in beta, an alert nobody receives is noise,
and there is exactly one person who would receive it.

Everything here is a file. A datasource clicked into a browser and a dashboard
saved in a browser are the same problem as a schema with no migrations: they
work until the machine is rebuilt, and then nobody can say what they were.

## Start it

```bash
docker compose up -d prometheus grafana postgres-exporter
```

| Where | Address | Credentials |
|---|---|---|
| Grafana | http://localhost:3001 | `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` from `.env` |
| Prometheus | http://localhost:9090 | none, and it is bound to loopback |

Grafana is on 3001 because the front end owns 3000.

## What is measured, and what is not

Four questions, and the dashboard answers only those.

**Bookings taken and bookings refused, by reason.** Derived from the HTTP
binder's `status` tag on `POST .../appointments`. Only `201` counts as a
booking: a `200` on the same route is an idempotent replay handing back the
first result, and counting it would inflate the number every time a phone
retried on a bad connection.

The `409` line is the one worth reading first. It is the `EXCLUDE USING gist`
constraint refusing a slot that had already been given away. A `409` count that
climbs while the booking count stays flat means the slot calculator is
advertising slots the database then rejects, which is a bug in scheduling and
not a busy day.

**The outbox.** Claimable now, scheduled for later, claimed but unacknowledged,
and dead, plus the age of the oldest claimable row.

**Latency of the two public reads a customer waits on.** The provider page and
the slot calculation. Mean and worst case.

**Both reactors alive.** `up` for the API and for the notification worker.

Not measured, deliberately: request rates for the fifty-odd other operations,
Keycloak, Redis, nginx, the front end, disk and CPU on the host, and any
per-provider breakdown. A tag carrying `provider_id` would be the obvious next
step and is the obvious next mistake: it multiplies every series by the number
of salons, on a Pi.

## Two things that are not obvious

**The outbox is read from PostgreSQL, not from the worker.** A gauge the worker
publishes disappears when the worker does, so the one moment the queue depth
matters is the one moment it is not there. `up` says the process answers; it
does not say the drain loop is turning. The queue depth, read from outside, says
both.

**`due` is not `count(*) WHERE status = 'PENDING'`.** A reminder for next Tuesday
is pending today and entirely healthy, and so is a row waiting out its retry
backoff. Counting those turns the graph into a measure of how far ahead the
salons are booked, which climbs on a good day and tells nobody anything. The
number that says the worker has stopped is the number of rows it could claim
right now and has not, so the query in `postgres-exporter/queries.yaml` is a copy
of the claim predicate in `NotificationOutboxSqlRepository.claimDue`. If that
`WHERE` clause changes, this one is wrong, and wrong silently.

## The scrape reaches out of the network, on purpose

`docker-compose.yml` carries infrastructure only. The API and the notification
worker are jars on the host, so Prometheus reaches them at
`host.docker.internal`, which compose maps to the bridge gateway.

Two consequences.

1. The port numbers in `prometheus/prometheus.yml` are literals. Prometheus does
   no environment substitution in its configuration file, so
   `BACKEND_MANAGEMENT_PORT` and `NOTIFICATION_WORKER_MANAGEMENT_PORT` cannot be
   read there. Changing one means changing it in both places, and a mismatch
   looks exactly like a process that is down.
2. Both processes bind their management interface to `0.0.0.0` by default,
   because a socket on `127.0.0.1` does not answer the bridge gateway on Linux.
   **Ports 9000 and 9100 must be closed at the host firewall.** They carry no
   authentication and nothing forwards them, but nothing stops them either. On a
   host where Prometheus is not in a container, set
   `BACKEND_MANAGEMENT_HOST=127.0.0.1` and
   `NOTIFICATION_WORKER_MANAGEMENT_HOST=127.0.0.1` instead and the question goes
   away.

## If a panel is empty

- **Everything empty, `up` is 0.** The jar is not running, or the firewall is in
  the way, or the management port does not match `prometheus.yml`. From the
  host: `curl -s localhost:9000/q/metrics | head`.
- **Booking and latency panels empty, `up` is 1.** The `uri` tag is not the path
  template these queries assume. It was `/v1/providers/{slug}`,
  `/v1/providers/{slug}/available-slots` and `/v1/providers/{slug}/appointments`
  when this was written, read off a running server rather than guessed, and a 4xx
  keeps its tag. If a Quarkus upgrade changes that, `curl -s
  localhost:9000/q/metrics | grep http_server_requests_seconds_count` prints what
  it actually is and the panel queries are one edit away.
- **Outbox panels empty.** The exporter cannot reach PostgreSQL, or the role
  cannot read the table. It connects as `balaaca_notification_worker`, whose RLS
  policy is `USING (true)`: read-only there would be better and would need a
  sixth database role in three files (see `docs/DEPLOYMENT.md`).

## What would come next, in order

1. A counter at the point a booking is refused, tagged with the published error
   code, so `SLOT_OUTSIDE_AVAILABILITY` stops sharing a line with
   `VALIDATION_FAILED` and `IDEMPOTENCY_KEY_REUSED`. Status is as fine-grained as
   HTTP gets.
2. A `MeterFilter` publishing histogram buckets for the two public reads, so the
   latency panel can say p95 instead of mean and worst.
3. Alerting, once there is somebody on call who is not the author.
