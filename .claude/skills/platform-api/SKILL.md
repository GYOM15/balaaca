---
name: platform-api
description: Governs the shape of the public REST surface. Use when adding or changing any operation a client can call, naming a /v1 path, an operationId, a wire field or an error code, shaping the public availability response, adding a mutating appointment operation, paginating a collection, deprecating something already published, or reviewing a PR that puts a provider identifier in a request, invents its own envelope, exposes busy ranges, or returns an error code outside the published catalogue.
---

# platform-api

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

The public surface of the platform. It is designed around **business
capabilities**, versioned, and shaped so a client SDK could be generated from
the spec as-is. Internals — module split, aggregates, tables, the tenant
resolution chain, tomorrow's service topology — never appear in it. We do not
publish SDKs yet; we keep the contract permanently worthy of one, because
retrofitting an SDK onto an accidental API is a rewrite, not a build step.

This skill also owns **the one normative error-code catalogue** (rule 6).
Every other skill that names a `code` references this list; nothing adds a
code that is not here.

## When to use

- Adding or changing any operation a non-owned client can call: the public
  discovery site, a provider's public page, the provider dashboard, the
  chatbot-service, a partner integration, a future SDK.
- Naming a public path, an operation id, a wire property, a query parameter,
  or an error `code`.
- Adding a mutating operation that creates, reschedules or cancels an
  appointment.
- Shaping the public availability response for a provider's page.
- Returning a collection, or an operation that could be rate-limited.
- Deprecating or removing anything already published.
- Reviewing a PR that exposes an internal type, a module name, a tenant
  concept, a busy range, or a camelCase field through the public spec.

## The rules

0. **The public booking route carries the provider's slug; every authenticated
   provider-scoped route carries no tenant identifier at all.** These are two
   different surfaces and conflating them breaks one of them.

   ```
   POST /v1/providers/{slug}/appointments   public - a customer books
   GET  /v1/appointments                    authenticated - a provider's agenda
   ```

   A customer is not staff, so membership resolution yields nothing for them.
   A booking route with no tenant identifier is unreachable by the very people
   it exists for: it resolves to no provider and answers 403. The slug is the
   correct source because it is already public - it is the string printed on
   the QR code and pasted into WhatsApp - and because it grants nothing beyond
   what the public page already shows.

   This is not the IDOR that rule 7 exists to prevent. The distinction is
   privilege, not identifier: `{slug}` selects a *public storefront*, while a
   `provider_id` on `GET /v1/appointments` would select *someone else's private
   agenda*. The tenant is still bound server-side, from a published provider
   only, and the public path may do exactly two things - create a `PENDING`
   appointment and read the public projections. It may never list appointments
   or read customers. See [CANONICAL.md](../CANONICAL.md) section 4.2.

1. **Model capabilities, never internals.** A public operation expresses what
   a caller wants to achieve (`GET /v1/providers/{slug}`, `GET
   /v1/providers/{slug}/available-slots`, `POST /v1/providers/{slug}/appointments`),
   never an internal aggregate, table, module boundary, or future service. The
   acceptance test is concrete: **we must be able to split a core module into
   a service, or change how availability is computed, without changing one
   line of the published spec.** If a refactor would force a spec change, the
   spec was leaking.
2. **No internal write path is ever exposed.** There is no public endpoint
   that sets an appointment status directly, inserts into the `notifications`
   outbox, assigns a `staff_id` on behalf of the server, or names a module. An
   appointment moves through its state machine only via documented capability
   operations (`POST /v1/appointments/{id}/cancellation`), and the outbox row
   is written in-process in the same transaction as the business change (see
   `outbox-messaging`), never by an API client.
3. **Public availability returns ONLY bookable slots — no `available` flag,
   no busy ranges.** The unauthenticated response to
   `GET /v1/providers/{slug}/available-slots` is a list of slots a stranger
   could actually book right now, each carrying `starts_at` and `ends_at` and
   nothing else. It carries no `available: false` entries, no busy intervals,
   no gaps annotated as taken. **The reason is not a timing oracle — it is
   that a uniform grid with an `available` flag is a minute-by-minute
   occupancy map of a named person at a named address, served to
   unauthenticated callers and trivially scraped on a schedule.** Publishing
   when a specific barber, midwife or mechanic is with a client, all day,
   every day, to anyone who can spell the slug, is a surveillance feed about
   identifiable people; that harm exists whether or not the customer's name is
   attached. If the UI wants a grid for layout, it lays bookable slots over
   **opening hours**, which are published separately and openly
   (`GET /v1/providers/{slug}/opening-hours`) because a shop's hours are
   already public. Everything a public projection returns is a separate named
   schema (`PublicProviderView`, `AvailableSlot`), never the dashboard schema
   with fields filtered at runtime — a projection enforced by shape cannot be
   leaked by a forgotten `if`.
4. **Appointment creation takes an `Idempotency-Key` header, and it is
   declared in the spec.** A booking is a scarce, non-fungible resource: a
   retried `POST /v1/appointments` that creates a second appointment burns a
   slot nobody can use, blocks a real customer, and forces the provider to
   clean up by hand. **Double-creating a booking is as harmful as a double
   charge**, so it gets the same protection. The header is a required
   parameter on the operation; a missing key is `400
   IDEMPOTENCY_KEY_REQUIRED`. The server stores a fingerprint of the request
   body beside the key: replaying the **same key with the same body** returns
   the first result, and the **same key with a different body** is `422
   IDEMPOTENCY_KEY_REUSED` (see `idempotency-concurrency`). Document the
   retention truthfully — **the key lives for the life of the appointment**,
   not for an invented 24-hour window. A key that is not in the published
   contract cannot be used by a generated SDK, so an undeclared header is a
   contract bug, not an implementation detail.
5. **One pagination convention across the whole API: cursor-based.** Every
   collection returns `{ data: [...], next_cursor: string|null }` and accepts
   `?cursor=&limit=`. No offset/page mixing, no endpoint inventing its own
   envelope. Cursors are opaque strings — never a leaked primary key, never a
   decodable row offset. `limit` has a documented default and maximum.
6. **Error `code`s are a published, closed, stable catalogue, and this is
   it.** Every RFC 7807 response carries a machine-readable `code` drawn from
   exactly this list, and no other file may add to it:

   | `code` | Status | Meaning |
   | --- | --- | --- |
   | `VALIDATION_FAILED` | 400 | The request body or parameters are malformed. |
   | `IDEMPOTENCY_KEY_REQUIRED` | 400 | A mutating operation arrived with no `Idempotency-Key`. |
   | `UNAUTHENTICATED` | 401 | No verified token, or the token is expired. |
   | `FORBIDDEN` | 403 | Authenticated, but the scope does not grant the operation. |
   | `PLAN_LIMIT_REACHED` | 403 | The provider's subscription plan forbids the action. |
   | `RESOURCE_NOT_FOUND` | 404 | The resource does not exist, or is not the caller's. |
   | `SLOT_UNAVAILABLE` | 409 | The slot was taken between the availability read and the write. |
   | `INVALID_STATE_TRANSITION` | 409 | The aggregate cannot move to the requested state. |
   | `SLOT_OUTSIDE_AVAILABILITY` | 422 | The requested slot falls outside published availability. |
   | `CANCELLATION_DEADLINE_PASSED` | 422 | The cancellation window for this appointment has closed. |
   | `CURRENCY_MISMATCH` | 422 | Two amounts in different currencies were combined. |
   | `IDEMPOTENCY_KEY_REUSED` | 422 | The key was replayed with a different request body. |
   | `RATE_LIMITED` | 429 | The documented quota for this operation is exhausted, or a contended resource could not be ordered. |
   | `INTERNAL_ERROR` | 500 | The server failed in a way it does not model. |

   Two entries carry a deliberate design decision. **`RESOURCE_NOT_FOUND` is
   one code for both a genuine miss and a cross-tenant read**, and the two
   responses must be byte-identical — same status, same `code`, same `title`,
   same `detail`, no distinguishing header or timing. Any second code for "it
   exists but is not yours" is precisely the existence oracle the 404 rule
   exists to prevent, and it also leaks the word *tenant*, an internal
   concept, into a public contract; there is no `TENANT_FORBIDDEN`, and there
   are no per-resource 404 codes. **`INTERNAL_ERROR` is in the list because a
   500 has to carry something**: the catalogue is closed and `Problem.code` is
   required, so an unhandled failure with no code would either return a body the
   published schema forbids or force every client to handle a missing field.
   Nothing else about it is public - the cause goes to the log with the trace id
   the response carries, and never into the body. **`PLAN_LIMIT_REACHED` is 403, never 402**:
   `402 Payment Required` asserts a payment path this product does not have.
   Codes are `SCREAMING_SNAKE_CASE` and **never renamed or reused** once
   published — a client branches on them. `title`/`detail` are human text and
   may change; the `code` may not.
7. **Authorization is part of the contract.** Each operation declares the
   OAuth2 scope(s) it requires (`appointments:write`, `catalog:write`,
   `schedule:write`, `dashboard:read`, `admin:providers:read`), and the spec
   documents them. Scopes are coarse capability grants, checked at the service
   layer as well (see `multi-tenant-rls`). **No provider identifier ever
   appears in a request** — not as a path segment, a query parameter, a body
   field, or a header. The tenant is resolved server-side from the verified
   JWT subject through `users` and `provider_staff`, so a scope grants access
   within the caller's own provider, never across providers. The public
   `{slug}` in a discovery path is a public handle for a public page, not a
   tenant selector: it never grants a write, and it is never accepted on a
   dashboard operation.
8. **The spec must be SDK-generatable, and that constrains its shape.** Every
   operation has a hand-written, stable `operationId` (`bookAppointment`, not
   `postAppointments1`); every payload is a **named schema**, never an inline
   anonymous object or a free-form `object`/map; enums are closed and named;
   money is always `{ amount_minor, currency }`; instants are `date-time` in
   UTC and local recurring times carry the provider's IANA zone (see
   `temporal-modelling`). If a generator would emit an unusable client, the
   spec is wrong — fix the spec, not the generator.
9. **The wire is snake_case, everywhere, without exception.** Every JSON
   property and every query parameter is snake_case: `next_cursor`,
   `service_offering_id`, `starts_at`, `ends_at`, `staff_id`, `amount_minor`,
   `blocked_from`. Java fields stay camelCase; the mapping happens at the
   adapter, once. A single camelCase property on the wire means clients must
   remember which convention each endpoint uses, and that is a permanent tax.
   The catalogue aggregate is published as `/v1/service-offerings`, and the
   field naming one is `service_offering_id` — never `service_id`, on any
   path or in any body.
10. **Version the surface in the path, and promise compatibility inside a
    version.** Every published path carries the version segment:
    `/v1/appointments`, `/v1/providers/{slug}/available-slots`,
    `/v1/service-offerings`. Within a version, changes are **additive only**:
    new optional fields, new operations, new enum values behind a documented
    fallback. Removing a field, tightening a type, renaming a `code`, or
    making an optional parameter required is a breaking change and requires
    `/v2` (see `contract-first`).
11. **Deprecate loudly, remove slowly.** A retiring operation or field is
    marked `deprecated` in the spec and returns `Deprecation` and `Sunset`
    headers with the removal date, with the replacement named in the
    description. Nothing published is ever silently removed.
12. **Rate limits and retry semantics are documented, not discovered.**
    Limited operations document their quota, return `429 RATE_LIMITED` with
    `Retry-After`, and say which errors are safe to retry. A `5xx` on an
    idempotent operation is retryable with the same `Idempotency-Key`; a `4xx`
    never is. A `409 SLOT_UNAVAILABLE` means the slot is gone — the client
    re-fetches availability, it does not retry the same body.

## Anti-patterns

- `PATCH /v1/appointments/{id}/status` or `POST /v1/notifications` exposed
  publicly -> rules 1-2; expose the capability, keep the state machine and
  the outbox write path internal.
- An endpoint named after the module that happens to serve it today
  (`/v1/scheduling-service/...`) -> rule 1; the client must not learn the
  topology.
- A uniform slot grid with `available: true|false`, or a `busy_ranges` array
  "so the UI can grey them out nicely" -> rule 3; that response is an
  occupancy log of a named person, published to anyone. Return bookable slots
  and lay them over separately published opening hours.
- Reusing `AppointmentView` on the public page and stripping fields in the
  resource -> rule 3; the public projection is a separate schema, not a
  runtime filter one refactor away from leaking.
- `POST /v1/appointments` with no `Idempotency-Key` parameter in the spec ->
  rule 4; a retried booking must be provably safe.
- Replaying an `Idempotency-Key` with a changed `starts_at` and getting `201`
  with the *original* appointment -> rule 4; different body, same key, is
  `422 IDEMPOTENCY_KEY_REUSED`.
- One endpoint returning `{items, page, total}` and another
  `{data, next_cursor}` -> rule 5; one envelope, cursor-based, everywhere.
- `detail: "appointment not found"` as the only signal, with no `code` ->
  rule 6; clients must branch on a stable code, not on prose.
- A `TENANT_FORBIDDEN` (or `APPOINTMENT_NOT_FOUND`, `PROVIDER_NOT_FOUND`,
  `SERVICE_NOT_FOUND`) code -> rule 6; one `RESOURCE_NOT_FOUND`, identical
  for a miss and for someone else's row.
- `402` for a plan limit -> rule 6; `403 PLAN_LIMIT_REACHED`. There is no
  payment path to point the client at.
- Renaming `SLOT_UNAVAILABLE` after publication -> rule 6; add a new code,
  keep the old one meaning what it meant.
- A `provider_id` query parameter "so the dashboard can pick the salon", or
  `GET /v1/providers/{id}/appointments` -> rule 7; the tenant comes from the
  database via the token, and the cross-tenant view is a separate privileged,
  audited `/v1/admin` surface.
- A request body typed `object` / `Map<String,Object>`, an end time or a
  duration sent by the client, or an `operationId` generated by the tooling
  -> rule 8; the slot is recomputed server-side and the SDK would be
  unusable.
- `serviceId`, `startsAt`, `nextCursor` on the wire, or a route
  `/v1/services` -> rules 8-9; snake_case properties, `service_offering_id`,
  `/v1/service-offerings`.
- A path published without `/v1` -> rule 10; there is then nowhere to put the
  next version.
- Making an optional field required "because it was always sent anyway"
  -> rule 10; that breaks every existing client.
- Deleting a deprecated field in the next release -> rule 11; `Sunset` first.

## Minimal correct example

```yaml
paths:
  /v1/appointments:
    post:
      operationId: bookAppointment            # stable, hand-written (rule 8)
      summary: Book an appointment
      security: [{ oauth2: [appointments:write] }]   # scope is contract (r.7)
      parameters:
        - name: Idempotency-Key               # required on booking (rule 4)
          in: header
          required: true
          schema: { type: string, maxLength: 64 }
          description: >
            Same key + same body replays the first result. Same key +
            different body is 422 IDEMPOTENCY_KEY_REUSED. The key is
            retained for the life of the appointment.
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/BookAppointmentRequest' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AppointmentView' }
        '409':
          description: SLOT_UNAVAILABLE — taken between read and write.
          content:
            application/problem+json:
              schema: { $ref: '#/components/schemas/Problem' }
        '422':
          description: SLOT_OUTSIDE_AVAILABILITY or IDEMPOTENCY_KEY_REUSED.
          content:
            application/problem+json:
              schema: { $ref: '#/components/schemas/Problem' }

  /v1/providers/{slug}/available-slots:
    get:
      operationId: listAvailableSlots
      security: []                            # public, reduced projection (r.3)
      description: >
        Returns only slots that can be booked. Busy time is not represented
        at all: an occupancy map of a named person is not public data.
        Pair with listOpeningHours for grid layout.
      parameters:
        - { name: slug, in: path, required: true, schema: { type: string } }
        - { name: service_offering_id, in: query, required: true,   # rule 9
            schema: { type: string, format: uuid } }
        - { name: from, in: query, required: true,
            schema: { type: string, format: date } }
        - { name: cursor, in: query, schema: { type: string } }     # rule 5
        - { name: limit, in: query,
            schema: { type: integer, default: 50, maximum: 200 } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AvailableSlotPage' }

  /v1/providers/{slug}/opening-hours:
    get:
      operationId: listOpeningHours           # public and already public (r.3)
      security: []
      parameters:
        - { name: slug, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/OpeningHoursView' }

components:
  schemas:
    Money:                                    # never a bare number (rule 8)
      type: object
      required: [amount_minor, currency]
      properties:
        amount_minor: { type: integer, format: int64 }  # currency's scale
        currency:     { type: string, example: GNF }    # ISO 4217, never fixed
    BookAppointmentRequest:                # no provider_id; no ends_at (r.7-8)
      type: object
      required: [service_offering_id, starts_at, customer]
      properties:
        service_offering_id: { type: string, format: uuid }
        starts_at: { type: string, format: date-time }   # UTC instant
        staff_id:                              # omit to let the server pick
          type: string
          format: uuid
        customer: { $ref: '#/components/schemas/CustomerContact' }
    AvailableSlot:                     # bookable slots only, no flag (rule 3)
      type: object
      required: [starts_at, ends_at]
      properties:
        starts_at: { type: string, format: date-time }
        ends_at:   { type: string, format: date-time }
    AvailableSlotPage:
      type: object
      required: [data, next_cursor]
      properties:
        data:
          type: array
          items: { $ref: '#/components/schemas/AvailableSlot' }
        next_cursor:
          type: [string, 'null']
          description: Opaque; null on the last page.
    Problem:                                  # RFC 7807 + stable code (rule 6)
      type: object
      required: [type, title, status, code]
      properties:
        type:   { type: string }
        title:  { type: string }
        status: { type: integer }
        detail: { type: string }
        code:
          type: string
          description: The closed catalogue owned by platform-api rule 6.
          enum:
            - VALIDATION_FAILED
            - IDEMPOTENCY_KEY_REQUIRED
            - UNAUTHENTICATED
            - FORBIDDEN
            - PLAN_LIMIT_REACHED
            - RESOURCE_NOT_FOUND
            - SLOT_UNAVAILABLE
            - INVALID_STATE_TRANSITION
            - SLOT_OUTSIDE_AVAILABILITY
            - CANCELLATION_DEADLINE_PASSED
            - CURRENCY_MISMATCH
            - IDEMPOTENCY_KEY_REUSED
            - RATE_LIMITED
            - INTERNAL_ERROR
```

No provider identifier anywhere in a request, no internal type, no module
name, no camelCase, no version-less path; busy time is not published at all;
the idempotency header, the scopes, the cursor envelope and the closed error
catalogue are all part of the contract — so a generated SDK is complete on
day one.

## Sibling skills

- `contract-first` — the workflow: one OpenAPI document in the runner module,
  spec first, spectral and openapi-diff in CI. This skill governs the SHAPE
  of that spec; `contract-first` governs the PROCESS.
- `backend-exceptions` — the RFC 7807 `Problem` body and the exception that
  maps to each `code` in rule 6.
- `idempotency-concurrency` — what `Idempotency-Key` and the request
  fingerprint must actually guarantee.
- `booking-integrity` — why `409 SLOT_UNAVAILABLE` exists, and why the server
  recomputes the slot from the service offering's own duration and buffers.
- `multi-tenant-rls` — why no provider identifier is ever a request field,
  and why a cross-tenant read returns an identical `RESOURCE_NOT_FOUND`.
- `pii-masking-logging` — the customer phone and name the public projection
  must never carry.
- `temporal-modelling` — UTC instants on the wire, provider-local recurring
  rules and the availability the public endpoint projects.
- `money-currency` — the `{ amount_minor, currency }` shape on the wire.
- `backend-naming` — `ServiceOffering`, `service_offerings`,
  `service_offering_id`, and the naming the public paths mirror.
- `backend-architecture` — the internal topology the public API must not
  leak.
