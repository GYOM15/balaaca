---
name: contract-first
description: The spec-before-code process for the single OpenAPI document and the notification event schema. Use when adding or changing a REST endpoint any client can call, emitting a new outbox notification or reshaping an existing payload, deciding where the OpenAPI file lives or wiring openapi-generator, versioning a contract, setting up the spectral and openapi-diff CI gate, or reviewing a PR that hand-writes a DTO or resource with no spec change, adds a second META-INF/openapi.yaml, or reaches for a .proto or gRPC.
---

# contract-first

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Every seam that crosses a process or a client boundary is described by a
versioned contract BEFORE the code exists. In Balaaca there are exactly
two such seams today: the external REST surface, described by **one**
hand-authored OpenAPI document, and the notification event payload,
described by its own schema. The contract is the source of truth; code is
generated from or verified against it, never the other way round.

## When to use

- Adding or changing any REST endpoint a client (the public site, a
  provider's public page, the dashboard BFF, chatbot-service,
  platform-admin) can call.
- Emitting a new notification event into the outbox table, or changing
  the shape of an existing payload.
- Deciding where the OpenAPI file lives, or wiring the generator.
- Reviewing a PR that hand-writes a DTO, a resource, or an event payload
  with no corresponding spec change.
- Reviewing a PR that adds a second `META-INF/openapi.yaml` — read rule 2.
- Being tempted to introduce a third contract kind — read rule 3 first.

## The rules

1. **The spec changes first, in the same PR, before the handler.** For a
   REST change, edit the hand-authored OpenAPI document and regenerate the
   server interface from it with the `openapi-generator-maven-plugin`
   (jaxrs-spec/microprofile generator); SmallRye then serves that same
   document as the runtime OpenAPI. For an event, edit the event-schema
   file next to the outbox. A reviewer must be able to read the intended
   behavior from the spec diff alone.
2. **There is exactly ONE OpenAPI document, and it lives in the runner/API
   module.** The published contract is
   `app/src/main/resources/META-INF/openapi.yaml` in the deployable that
   assembles the core contexts — not one per Maven module. This is not a
   style preference: **every module's `META-INF/openapi.yaml` lands on the
   same classpath at the same path, so SmallRye silently serves whichever
   one wins the scan and drops the rest.** Under that arrangement half the
   published operations disappear at runtime with no error, and a closed
   enum like the `Problem.code` catalogue could not exist at all, because
   each module would be declaring its own truncated copy. Per-module
   *fragments* are fine when the document grows unwieldy, on two
   conditions: they live under **distinct filenames outside `META-INF`**
   (`booking/src/main/resources/openapi/booking.fragment.yaml`), and a
   build step merges them into the single runner document, which is what
   is linted, diffed and served. Runtime annotation scanning stays off
   (`mp.openapi.scan.disable=true`) so nothing can quietly append to the
   published surface.
3. **One contract kind per seam, and today there are only two.**
   client→core = REST/OpenAPI. core→satellite = a notification **event**
   payload with its own schema, written to the `notifications` table,
   which IS the outbox — there is no broker (cross-ref
   `outbox-messaging`). Module→module inside the core is an in-process
   Java call through the callee's inbound port and has **no** network
   contract at all (cross-ref `backend-architecture`). **There is no
   `.proto` and no gRPC in this project**, and no file may introduce one:
   `chatbot-service` calls the public business API over REST and never
   touches the database, and `notification-worker` reads the outbox
   table. A `.proto` seam would only ever appear if a genuinely separate
   deployable needed a synchronous call — none does — and inventing one
   for an in-process call is the mistake this rule exists to prevent.
4. **REST resources mirror the OpenAPI resource hierarchy, under `/v1`.** A
   path is the version segment followed by English kebab-case plural nouns
   with no verbs (`POST /v1/appointments`, `GET
   /v1/providers/{slug}/available-slots`, `GET /v1/service-offerings`, not
   `POST /createAppointment` and never a version-less path). The HTTP
   method carries the action. Every JSON property and query parameter is
   snake_case (`service_offering_id`, `starts_at`, `next_cursor`). URLs and
   schema names are English even though user-facing strings are French
   first (cross-ref `code-language`).
5. **Errors are part of the contract.** Every operation documents its
   RFC 7807 `application/problem+json` responses and their stable error
   `code`s, drawn from the single closed catalogue owned by
   `platform-api`. A new error path means a spec change, not just a new
   exception (cross-ref `backend-exceptions`). The `409` raised when the
   exclusion constraint rejects an overlapping appointment is a
   documented response with the `SLOT_UNAVAILABLE` code, not an
   undocumented surprise.
6. **Money, time and identifiers have contract-level types.** Money is
   always `{ amount_minor: integer, currency: string }` with the
   currency's own scale documented — never a bare number, never a float,
   never an assumed "cents", and never a hardcoded currency. Instants are
   `date-time` in UTC; a recurring local time carries the provider's IANA
   zone. **No provider identifier is ever a request field**: the tenant is
   resolved server-side from the verified JWT subject through `users` and
   `provider_staff`, so it must not appear in any request schema, path,
   query or header (cross-ref `money-currency`, `temporal-modelling`,
   `multi-tenant-rls`).
7. **Event schemas are explicit, versioned, and additive.** Each outbox
   notification has a documented schema (event type, version, dedupe key,
   payload) and a stable type name. Evolve additively (new optional
   fields); a breaking change is a new versioned event type, never a
   silent reshape — delivery is at-least-once and an older
   `notification-worker` must keep working against rows written by a
   newer core (cross-ref `outbox-messaging`).
8. **Version every contract; breaking changes bump the version.** REST
   carries the version in the path (`/v1/...`); event schemas carry an
   explicit version and only ever add optional fields within one version.
   Removing a field, tightening a type, renaming an error `code`, or
   making an optional parameter required is a version bump, never an edit
   in place.
9. **Generated code is never committed, so there is no code-drift check —
   what CI checks is the spec.** The `openapi-generator-maven-plugin`
   writes the server interfaces and DTOs into `target/generated-sources`
   on every build, and they are gitignored. There is no checked-in copy to
   diverge from the spec, and therefore no drift job to write or to
   forget: the only way to change the interface is to change the spec, and
   the compiler catches a resource that no longer matches its generated
   interface. What CI **does** enforce is that the merged document is
   sound and safe to publish — it runs spectral against it, fails on an
   invalid OpenAPI file, and runs openapi-diff plus the event-schema
   backward-compatibility check against the previous version so a breaking
   change cannot merge unnoticed (cross-ref `ci-workflow`, which owns the
   job definitions). Generated code is never edited by hand.
10. **This skill owns the PROCESS; `platform-api` owns the SHAPE.** Spec
    first, one document, generation, versioning and the CI gate are the
    rules above. WHAT the public spec is allowed to contain —
    capability-oriented operations, no internal leakage, bookable-slots-only
    public availability, `Idempotency-Key` on appointment creation, the
    cursor pagination envelope, the closed error-`code` catalogue, OAuth2
    scopes, and SDK-generatability — is governed by **`platform-api`**. A
    public operation must satisfy both skills before it merges.

## Anti-patterns

- A `META-INF/openapi.yaml` in `booking/` and another in `catalog/` →
  rule 2; they collide on the classpath and SmallRye serves one of them,
  silently. One document in the runner module, or distinctly named
  fragments merged into it at build time.
- Turning annotation scanning back on "so the new resource shows up" →
  rule 2; the published surface is the file, not whatever the scanner
  happens to find.
- A public endpoint shaped like an internal table or module split
  (`POST /v1/notifications`, `PATCH /v1/appointments/{id}/status`) →
  rule 10; expose the capability (`POST /v1/appointments/{id}/cancellation`),
  keep the state machine and the outbox write internal.
- An operation with an untyped `Map<String,Object>` payload or a
  generated operation id like `postAppointments1` → rule 10; an SDK
  generated from this is unusable, so the spec is wrong.
- Writing the JAX-RS resource and `@Schema` annotations first, then
  "extracting" an OpenAPI doc from the running app → rule 1. Spec first.
- Adding a `.proto` for a `booking → catalog` call because both are
  "services" → rule 3; they are modules in one deployable and that is an
  in-process port call. There is no gRPC here at all.
- Describing the notification payload only in Java, so the worker and the
  core agree by accident → rule 3+7; the payload is a written, versioned
  schema.
- A path with a verb, or a path with no version segment:
  `POST /appointments/cancelAppointment` → rule 4; use
  `POST /v1/appointments/{id}/cancellation`.
- `serviceId` in a body or `?serviceId=` in a query → rule 4;
  `service_offering_id`, snake_case, on `/v1/service-offerings`.
- A request body carrying `provider_id`, an `ends_at` the server should
  compute, or a price as a free number → rule 6; the tenant comes from
  the database via the token, the slot is recomputed server-side, money
  is a typed `{ amount_minor, currency }`.
- Adding a 409 response in code with no matching documented
  `problem+json` response in the spec → rule 5.
- Inventing an error `code` in a handler that is not in the `platform-api`
  catalogue → rule 5; the enum is closed and lives in one document.
- Changing a required event field's meaning in place → rule 7+8; that
  silently breaks a worker still draining older rows.
- Adding a "generated-code drift" CI job → rule 9; nothing is committed to
  drift from. Spend the job on spectral and openapi-diff instead.
- Editing generated resource/DTO code by hand to "fix" a mismatch instead
  of changing the spec → rule 9.

## Minimal correct example

The one OpenAPI document (`app/src/main/resources/META-INF/openapi.yaml`),
assembled from per-context fragments at build time and served by SmallRye:

```yaml
paths:
  /v1/appointments:
    post:
      operationId: bookAppointment
      parameters:
        - { name: Idempotency-Key, in: header, required: true,
            schema: { type: string, maxLength: 64 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/BookAppointmentRequest' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AppointmentView' }
        '409':
          description: SLOT_UNAVAILABLE
          content:
            application/problem+json:
              schema: { $ref: '#/components/schemas/Problem' }
components:
  schemas:
    BookAppointmentRequest:    # no provider_id — resolved from the token
      type: object             # no ends_at — recomputed from the offering
      required: [service_offering_id, starts_at, customer]
      properties:
        service_offering_id: { type: string, format: uuid }
        starts_at: { type: string, format: date-time }
        customer:  { $ref: '#/components/schemas/CustomerContact' }
    Money:
      type: object
      required: [amount_minor, currency]
      properties:
        amount_minor: { type: integer, format: int64 }  # currency's scale
        currency:     { type: string, example: GNF }
```

Fragments merged into it, and scanning off, so nothing else can publish:

```xml
<!-- app/pom.xml: one merged document, one served document -->
<plugin>
  <groupId>org.openapitools</groupId>
  <artifactId>openapi-generator-maven-plugin</artifactId>
  <configuration>
    <!-- fragments: */src/main/resources/openapi/*.fragment.yaml
         are merged into META-INF/openapi.yaml before this runs -->
    <inputSpec>${project.basedir}/src/main/resources/META-INF/openapi.yaml</inputSpec>
    <generatorName>jaxrs-spec</generatorName>
    <output>${project.build.directory}/generated-sources/openapi</output>
  </configuration>
</plugin>
```

```properties
# app/src/main/resources/application.properties
mp.openapi.scan.disable=true   # the file is the contract, not the classpath
```

The resource implements the generated interface — it never invents the
shape:

```java
@Path("/v1/appointments")
public class AppointmentResource implements AppointmentsApi {
    // AppointmentsApi is generated from the single openapi.yaml into
    // target/generated-sources and is never committed.
    @Override
    public Response bookAppointment(String idempotencyKey,
                                    BookAppointmentRequest request) {
        // The provider is ambient: resolved from the JWT subject through
        // users -> provider_staff and read from TenantContext inside the
        // service. Never a body field, never an argument.
        AppointmentView view = bookAppointment.handle(idempotencyKey, request);
        return Response.status(201).entity(view).build();
    }
}
```

The `AppointmentConfirmed` notification has its own versioned payload
schema documented alongside the outbox, and CI fails the PR if spectral
rejects the merged document or openapi-diff reports a breaking change.

## Sibling skills

- `platform-api` — the SHAPE of the public spec and the one normative
  error-`code` catalogue; this skill is the PROCESS. Both must pass.
- `backend-architecture` — which seam gets which contract; module→module
  stays an in-process port call with no network contract.
- `backend-exceptions` — the RFC 7807 error shapes and `code`s the spec
  documents.
- `backend-naming` — `ServiceOffering`, `service_offerings`,
  `service_offering_id`, and the naming the paths mirror.
- `booking-integrity` — why the server recomputes the slot and why the
  documented `409 SLOT_UNAVAILABLE` exists.
- `idempotency-concurrency` — what the declared `Idempotency-Key` header
  and its request fingerprint must guarantee.
- `money-currency` — the money contract type and per-currency scale.
- `temporal-modelling` — UTC instants versus provider-local recurring
  times on the wire.
- `multi-tenant-rls` — why no provider identifier appears in a request
  schema.
- `outbox-messaging` — the notifications table as the outbox, and
  additive, versioned payload evolution.
- `ci-workflow` — the pipeline gate that owns the spectral lint and the
  openapi-diff job.
- `code-language` — URLs and schemas are English; user-facing strings are
  French first.
