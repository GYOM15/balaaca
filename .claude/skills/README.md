# Skills — Balaaca (Quarkus)

A pack of skills — convention playbooks — cut for **Balaaca**, the hub for
service providers: barbers, salons, photographers, consultants, repairers,
coaches, home services. A provider publishes a public page, a catalogue of
service offerings with prices, and availability; customers find the provider
and book an appointment. **Booking is a capability, not the domain** — the
domain is the provider's commercial presence.

Launch market: Guinea (GNF, `Africa/Conakry`). The product is **not** single
country: nothing hard-codes a currency, a dialling prefix, or a time zone. This
is a **production system**, not an MVP.

Stack: **Java 21 · Quarkus · modular monolith, multi-module Maven · hexagonal +
DDD · PostgreSQL 18 + Flyway + RLS `ENABLE`/`FORCE` · Redis (cache, rate
limiting) · Keycloak (sole IdP) · Next.js + httpOnly-cookie BFF**. Deployment
target: a VPS; a Raspberry Pi is only a transitional step (multi-arch amd64 +
arm64 images), and **nothing** in the design bends to its resources.

Package root: `com.balaaca`. Bounded contexts, a **closed** list:
`shared-kernel`, `identity`, `providers` (the tenant root), `catalog`,
`scheduling`, `booking`, `billing`. Separately deployable satellites:
`notification-worker`, `chatbot-service`.

**This pack is written in English**, like the code it governs — identifiers,
comments, Javadoc, logs, config keys, metric names, REST slugs and OpenAPI
schemas are all English (`code-language`). Only user-facing text is French
first, and it always resolves from the i18n catalogue under a stable English
key, never a hard-coded literal.

## How to use it

1. The directory lives in the repository: `<repo>/.claude/skills/`.
2. Open a Claude Code session on the repository. Skills are discovered
   automatically — one directory, one skill, via its `SKILL.md`.
3. Paste your end-to-end architecture prompt. The agent obeys these skills:
   they **outrank** the model's default conventions.

Every `SKILL.md` in this pack begins with YAML frontmatter carrying a `name`
(the exact directory name) and a `description` naming the concrete situations
that should trigger it. That frontmatter is what makes a skill discoverable; a
skill file without it is dead weight the agent never loads at the right moment.
If you add a skill, add the frontmatter.

> These skills freeze **package structure, naming, commits, tests and the
> locked-down paradigms**. They do not replace your architecture prompt — they
> apply it uniformly. At scaffolding time the agent must still **confirm the
> current stable versions** of the stack (Java LTS, Quarkus, PostgreSQL,
> Keycloak, Redis, libraries) as your prompt asks.

## The 22 skills

**Architecture and code**

- `backend-architecture` — modular monolith + hexagonal, 7 bounded contexts
  (closed list) + 2 satellites, dependencies inward only, in-process Java calls
  through the callee's inbound port, the `notifications` table as the outbox to
  the satellites. **No broker, no gRPC.** `shared-kernel` is the one context
  exempt from the four-layer rule.
- `backend-srp` — SRP for CDI beans; business rules stay in the domain, never
  in a `*Resource` and never in a repository.
- `domain-boundaries` - typed values and identifiers in the core, translation
  at the edge, and when a mapper earns its place.
- `backend-naming` — English naming; `*UseCase` / `*Service` / `*Repository` /
  `*Port` / `*Resource`, adapters named for their technology, **plural
  snake_case tables**, `Vnnn__snake_case` migrations, past-tense domain events.
- `backend-di` — constructor CDI injection (`final` fields), explicit scopes,
  injected `Clock`, zero mutable static state.
- `backend-exceptions` — two levels plus **RFC 7807** `application/problem+json`
  through a single `ExceptionMapper`, one `DomainException` base in
  `com.balaaca.sharedkernel.error`, stable `SCREAMING_SNAKE_CASE` codes, a
  cross-tenant read answered with a byte-identical **404 `RESOURCE_NOT_FOUND`**.
- `contract-first` — **the PROCESS**: one hand-authored OpenAPI document as the
  source of truth, living in the runner/API module; server interfaces generated
  into `target/` and **never** committed; CI lints the spec and runs
  openapi-diff for backward compatibility. No `.proto`, anywhere.
- `platform-api` — **the SHAPE** of the public surface: versioned English
  plural kebab paths with no verb (`/v1/appointments`), **snake_case on the
  wire** for every JSON property and query parameter, cursor pagination
  `{ data, next_cursor }` with `?cursor=&limit=`, `Idempotency-Key` declared and
  **required** on appointment creation, no tenant identifier in any request,
  deprecation announced.
- `cdi-interceptors` — cross-cutting concerns via
  `@InterceptorBinding`/`@Interceptor`; `TenantBoundInterceptor` fills
  `TenantContext` at `Interceptor.Priority.PLATFORM_BEFORE + 10`; **never** a
  business rule hidden in an interceptor.
- `pii-masking-logging` — JSON logs, `correlation_id` and `provider_id` carried
  **raw** in the MDC because they are operational identifiers, masking for
  identifiers that resolve to a natural person and for customer phone and
  e-mail, never a secret or a raw JWT. Masking happens at the log boundary
  only — never inside `toString()`.
- `code-language` — code, identifiers, comments, Javadoc, logs, config keys,
  metric names, REST slugs and OpenAPI schemas in **English**; user-facing text
  **French first**, always resolved from the i18n catalogue under a stable
  English key, never a hard-coded literal.
- `code-comments` — **concise** Javadoc (the why, not the what), **no emoji**,
  no "generated by" markers; code that never reads as machine-written.

**Locked-down invariants**

- `booking-integrity` — the product's most critical invariant:
  anti-double-booking owned by **PostgreSQL** via `EXCLUDE USING gist` on
  `(provider_id, staff_id, blocked_range)` filtered to `PENDING`/`CONFIRMED`,
  `staff_id NOT NULL`, the slot always recomputed server-side, `23P01` → 409
  `SLOT_UNAVAILABLE`. Owns the **one normative `appointments` DDL**
  (`V014__create_appointments.sql`); every other skill shows an excerpt and
  points here. "Any available staff" **retries** against the next candidate
  rather than answering 409. No Redis lock, no advisory lock, no
  `SELECT FOR UPDATE` for exclusion.
- `multi-tenant-rls` — the tenant **is the provider**. `provider_id` on every
  scoped table, resolved **from the database** (JWT `sub` → `users` →
  `provider_staff` → `provider_id`), never from a claim and **never cached**;
  ambient `@RequestScoped` `TenantContext`, **never** a parameter; the
  `app.provider_id` GUC bound by a **connection-level hook**, not by a business
  interceptor; defence in depth across four layers (routing, application,
  Hibernate filter, `FORCE` RLS) plus composite foreign keys; fail-closed;
  non-leak tests and an IDOR matrix.
- `temporal-modelling` — instants in UTC `timestamptz`, recurring rules in
  local time plus the provider's IANA zone, calendar exceptions as
  `AvailabilityOverride` on local dates, injected `java.time.Clock`, never
  `LocalDateTime.now()` without a zone, never a date as a `String`. Windows may
  span midnight. Guinea sits at UTC+0 with no DST, so slot tests also run under
  `Europe/Paris`.
- `money-currency` — `Money.ofMinor(long, Currency)`, scale carried by the
  currency (GNF has 0 decimals, so no "cents" and no ×100), never a `double`,
  persisted as a `(..._amount_minor, ..._currency)` pair, **never** GNF
  hard-coded, the price frozen onto the appointment at booking time.
- `idempotency-concurrency` — idempotency (a UNIQUE key **plus** a request
  fingerprint) and concurrency (database constraint plus atomic state-machine
  transitions): two distinct problems, both required.
- `outbox-messaging` — the `notifications` table **is** the transactional
  outbox: inserted in the same transaction as the business change, drained by
  the `notification-worker` with `SELECT ... FOR UPDATE SKIP LOCKED`, `SENT`
  only after the channel acknowledges, deduplicated by a UNIQUE `dedupe_key`
  that embeds the target instant, exponential backoff with jitter then a `DEAD`
  state, **at-least-once** delivery so consumers are idempotent.

**Delivery and process**

- `backend-tests` — Testcontainers PostgreSQL 18 (never H2, never a mocked
  database when the behaviour under test is persistence, RLS, a constraint or
  concurrency), jqwik on `Money` arithmetic **and** slot calculation, ArchUnit
  on hexagonal boundaries, the closed context list and cross-context imports,
  PIT on `scheduling`, `booking` and shared-kernel money/time; mandatory
  suites: tenant non-leak, the IDOR/BOLA matrix, and booking concurrency —
  including the N-staff "any staff" test that must yield N successes.
- `commit-style` — **house convention**: capitalized imperative subject with
  **no type/scope**, <= 50 chars (body <= 72), signed commits, **never** a
  Co-Authored-By trailer. Enforced by local hooks only.
- `branch-naming` — `main` for release, `develop` for integration and the
  GitHub default, `feature/<kebab-slug>` cut from `develop` and merged back by
  PR, promotion to `main` at phase milestones. Owns the single authoritative
  `pre-push` hook.
- `ci-workflow` — GitHub Actions, **100% keyless**: build → tests → ArchUnit →
  Semgrep OSS → gitleaks / OSV-Scanner / Trivy / Syft → coverage and mutation
  gates scoped to `domain/` and `application/` → the image is **booted**
  against a throwaway database and `/q/health/ready` awaited before scan or
  push. Actions pinned to a 40-character SHA.

## Canonical forms (one form, everywhere)

These names and signatures are **unique across the whole pack**. An agent that
loads two skills must produce compatible code, so they are never redeclared
elsewhere — other files point here.

| Concept | Canonical form |
|---|---|
| Use case | port `BookAppointmentUseCase` (interface, `ports/inbound`) + bean `BookAppointmentService` — **never `*ServiceImpl`** |
| Adapter | named for its technology: `AppointmentPanacheRepository`, `SmsNotificationGateway` — **never `*Impl`** |
| Packages | `domain` · `ports/inbound\|outbound` · `application` · `adapters/inbound/{rest}` and `adapters/outbound/{persistence,gateway,messaging}`. `shared-kernel` is exempt: `com.balaaca.sharedkernel.{money,time,logging,tenancy,error}` |
| Tables | English **snake_case plural**: `users`, `providers`, `provider_staff`, `provider_categories`, `service_offerings`, `availability_rules`, `availability_overrides`, `customers`, `appointments`, `notifications`, `subscriptions`, `audit_logs` |
| Catalogue aggregate | Java `ServiceOffering` · table `service_offerings` · FK `service_offering_id` · route `/v1/service-offerings` · wire field `service_offering_id` · inbound port `LookupServiceOfferingUseCase` |
| Calendar exception | aggregate `AvailabilityOverride`, table `availability_overrides` — **never** `AvailabilityException` (a non-throwable ending in `Exception` is a trap) |
| Frozen price | columns `customer_price_amount_minor` / `customer_price_currency`, accessor `customerPrice()` |
| Money | `Money.ofMinor(long, Currency)` · `add` · `allocate` · `Currency.of(String)` throwing `UnknownCurrencyException`; columns `(..._amount_minor bigint, ..._currency varchar(3) CHECK (~ '^[A-Z]{3}$'))` — never `char(3)` |
| Phone | `PhoneNumber` in E.164, default region derived from the provider's country — **never `+224` hard-coded**; `toString()` is never masked |
| Tenant | `TenantContext` defined **once** in `shared-kernel`, `@RequestScoped`: `require()` public, `assign()`/`clear()` package-private, filled **only** by `TenantBoundInterceptor` (`Interceptor.Priority.PLATFORM_BEFORE + 10`) from the database resolution — never a parameter, never a JWT claim, **never cached** |
| Tenant resolution failure | `NoProviderMembershipException` |
| SQL session GUC | bound by a **connection-level hook** (Agroal listener / Hibernate integrator) issuing `SELECT set_config('app.provider_id', ?, true)` as the first statement on the connection enlisted in each transaction — not by a business interceptor |
| RLS predicate | `provider_id = nullif(current_setting('app.provider_id', true), '')::uuid`, in every policy, in every file |
| Anti-double-booking | `EXCLUDE USING gist (provider_id WITH =, staff_id WITH =, blocked_range WITH &&) WHERE (status IN ('PENDING','CONFIRMED'))`, over `CREATE EXTENSION IF NOT EXISTS btree_gist` |
| Blocked range | ordinary `blocked_from` / `blocked_until` columns computed by the application, plus `blocked_range tstzrange GENERATED ALWAYS AS (tstzrange(blocked_from, blocked_until, '[)')) STORED` and the derivation pinned by a `CHECK` using `make_interval` over the frozen `buffer_before_minutes` / `buffer_after_minutes` |
| Appointment insert port | `insertIfAbsent` — never `save`, never `insert` |
| Slot conflict | `SlotUnavailableException` → 409 `SLOT_UNAVAILABLE` |
| Not found | one code, `RESOURCE_NOT_FOUND`, byte-identical for a genuine miss and a cross-tenant read |
| Plan limit | `PlanLimitReachedException` → **403** `PLAN_LIMIT_REACHED` — never 402 |
| Quotas | `PlanCatalog` in **code** (FREE / PRO / BUSINESS); the database stores only the subscribed plan |
| Outbox | insert into `notifications` **inside the business transaction**; drained `FOR UPDATE SKIP LOCKED` by the `notification-worker`; due column `scheduled_at`; dedupe key `appointment:{uuid}:REMINDER_24H:{scheduled_at_epoch_seconds}` |
| Wire format | **snake_case** for every JSON property and query parameter (`next_cursor`, `service_offering_id`, `starts_at`, `staff_id`, `amount_minor`) — no camelCase on the wire, anywhere |
| REST paths | versioned: `/v1/appointments`, `/v1/providers/{slug}/available-slots`, `/v1/service-offerings` |
| Migrations | `V014__snake_case.sql` — three-digit versions, distinct across the whole pack |
| Structured log events | dotted lowercase: `appointment.booked`, `appointment.book.slot_unavailable` |

## What changed from the inherited restaurant pack (and why)

This pack descends from one written for a multi-tenant restaurant SaaS. The
divergences below are **owner decisions**, not oversights. Where the old pack
says otherwise, this file and the skill concerned are authoritative.

- **The tenant no longer comes from a JWT claim.** It is resolved **in the
  database**: verified `sub` → `users.keycloak_user_id` → `users.id` →
  `provider_staff.user_id` → `provider_id`. Three reasons: a provider creates
  the tenant **after** signing up, so no claim can exist at first login;
  revoking a staff member must take effect **immediately**, not at token
  expiry; and putting membership in Keycloak would make it a second source of
  truth to synchronise with `provider_staff`. The JWT stays authoritative for
  **identity** (`sub`) and **global roles**; the database is authoritative for
  **tenant membership**. The column is `provider_id`, no longer `tenant_id`.
- **No broker.** No Kafka, no Redpanda. The `notifications` table **is** the
  transactional outbox and the `notification-worker` drains it. Every classic
  outbox rule still applies — only the transport changed. A broker is
  **deferred** until volume justifies it; the table already gives transactional
  safety without one.
- **No ledger, no payment gateway.** There is currently **no** payment, no PSP,
  no invoicing, no double-entry bookkeeping. `billing` handles subscriptions
  and **entitlements** (quotas) only, and provider payout does not exist yet;
  when it arrives the natural seam is an **event**, not a synchronous call.
  Accordingly `ledger-double-entry` and `payments-gateway` were **removed from
  the pack** and moved to `docs/deferred-skills`. They come back only the day
  payments are actually built — until then, never reference them from a sibling
  list.
- **No gRPC, no `.proto`.** Communication between core modules is an in-process
  **Java call** through the callee's inbound port. Entitlement checks stay
  in-process and must **never** become a synchronous inter-service call.
- **SonarQube removed.** Its quality gate needs a paid hosted instance, and CI
  must stay **entirely keyless**. The analysis chain is therefore Semgrep OSS
  with a local ruleset (**never** an App token), gitleaks (the MIT binary, not
  the billed action), OSV-Scanner, Trivy against the built image, Syft for the
  SBOM.
- **`develop` is reinstated.** The old "no long-lived `develop` branch" rule,
  inherited from trunk-based development, is **reversed by explicit owner
  decision**: `main` is the release branch, `develop` is integration and the
  GitHub default, and `develop` is promoted to `main` at phase milestones.
- **No emoji, anywhere** — code, Javadoc, commits, exception messages **and
  logs**. Logs are structured JSON parsed by machine: status travels in the log
  level and an `outcome` field, never in a pictogram.

## What an adversarial review corrected in this pack (and why)

A review of the pack against PostgreSQL 18.6 and the Quarkus interceptor model
found defects that would have produced an application that does not run. These
are settled; do not re-open them.

- **The RLS GUC was never bound.** `TenantBoundInterceptor` runs at
  `PLATFORM_BEFORE + 10`, outside the transaction (Quarkus's transactional
  interceptor sits at `PLATFORM_BEFORE + 200`), so it cannot call a
  `@Transactional(MANDATORY)` binder — and nothing else called one. Every
  tenant query would have failed. The GUC is now bound by a **connection-level
  hook**, which also covers transactions opened without `@TenantBound`.
- **Every RLS predicate now degrades to NULL.** `current_setting` without
  `missing_ok` raises `42704`, and `''::uuid` raises `22P02`. Only
  `nullif(current_setting('app.provider_id', true), '')::uuid` filters every
  row and yields a deterministic 404 instead of a 500.
- **The Redis membership cache is gone.** A five-minute positive cache of
  subject → `provider_id` is a five-minute token: delete a `provider_staff` row,
  miss the eviction, and revoked staff keep access. It was a dual write across
  two failure domains, and it destroyed the very reason the JWT claim was
  rejected. There is no cache on the authorisation path; the resolution is a
  two-join lookup on primary-key paths.
- **An empty range defeated the exclusion constraint.** With
  `blocked_from = blocked_until` the generated `tstzrange` is empty, `&&` is
  false against everything, and unlimited appointments insert at the same
  instant. Explicit `CHECK` constraints now guard the window, the block's
  non-emptiness, and its coverage of the appointment.
- **A generated column may not call `make_interval`** — `42P17`, the migration
  simply does not run, because `timestamptz ± interval` is `STABLE`, not
  `IMMUTABLE`. `blocked_from` and `blocked_until` are ordinary columns; only
  `blocked_range` is generated, and a `CHECK` (which *may* use `make_interval`)
  pins the derivation from the frozen buffers.
- **Composite foreign keys needed matching UNIQUE constraints** — `42830`
  without them, on `provider_staff`, `service_offerings`, `customers` and
  `appointments` itself.
- **"Any available staff" produced spurious 409s.** All concurrent racers
  compute the same least-loaded candidate, so five simultaneous requests at a
  salon with five free chairs gave one success and four conflicts. A
  server-chosen staff member now retries in a new transaction against the next
  eligible candidate; only a client-named one maps `23P01` straight to 409.
- **Public availability leaked an occupancy map.** A uniform grid with an
  `available` flag publishes, to unauthenticated scrapers, a minute-by-minute
  record of where a named person is. Only bookable slots are returned.
- **Idempotency keys needed a request fingerprint.** A key reused with a
  different body returned the first appointment and reported success. A stored
  `idempotency_request_hash` now distinguishes a replay from
  `IDEMPOTENCY_KEY_REUSED` (422).
- **Error taxonomy collapsed to one base and one 404.** Per-context exception
  bases left `ExceptionMapper<DomainException>` unable to catch six of seven
  hierarchies, surfacing raw 500s; and per-resource 404 codes plus a
  `TENANT_FORBIDDEN` re-created the tenant oracle that the single
  `RESOURCE_NOT_FOUND` exists to close.
- **A person can only be staff at one provider** — a documented **known
  limitation**, now enforced by a partial unique index instead of being
  silently assumed by the resolver. The future mechanism is a server-side
  selected membership validated against `provider_staff` on every request,
  never a client-supplied provider id. Not built now.
- **Midnight-spanning windows are storable.** A provider open 22:00–01:00 is
  real; `start_time <> end_time` replaces `start_time < end_time`, and a
  wrapping window is documented rather than rejected.
- **The pack claimed enforcement it did not have.** `commit-style` said
  unsigned commits were rejected at the gate while `ci-workflow` ran no such
  check, on a private repository where branch protection needs a paid plan.
  Signing and message format are now stated honestly as client-side hooks,
  bypassable with `--no-verify`. `branch-naming` owns the single `pre-push`
  hook, it guards both `main` and `develop`, and the milestone promotion has an
  explicit named override rather than a silent `--no-verify`.
- **Maven cannot enforce a ports-only boundary** — depending on a context's
  artifact puts its `application/` and `adapters/` on the classpath. One module
  per context stands; ArchUnit enforces the boundary, and the pack says so
  plainly instead of implying the compiler does it.
- **The pack broke its own rules.** Inline `Logger` fields sat in
  application-service examples that a logging-interceptor rule forbids;
  `provider_id` and `correlation_id` were masked, defeating the correlation
  they exist for; and `PhoneNumber.toString()` returned a masked value, which
  would have written masked recipients into notification rows and failed every
  reminder.

Read them before use: these are an architect's recommendations, to be adjusted
if a choice does not suit you.
