# Balaaca

A hub of service providers. A provider publishes their page, their service
offerings and their availability; a customer finds them, books, and gets their
reminders.

The name comes from the Kissi *balaa* (work, activity) and from *ca* for Africa.

> Status: under construction. This README describes what actually exists in the
> repository, not what is planned. The full functional target is in [docs/](docs/).

## What this is

The appointment is a capability of the product, not its domain. The domain is the
provider: their online presence, their catalogue, their diary, their customer
relationship, and eventually their subscription to the platform.

Launch market: Guinea (GNF, `Africa/Conakry`). Nowhere does the architecture
assume a single currency, dialling code or timezone.

## Stack

| Layer | Choice |
|---|---|
| Backend | Java 21, Quarkus, a hexagonal modular monolith, Maven |
| Database | PostgreSQL 16, Flyway migrations, forced Row-Level Security |
| Identity | Keycloak (OIDC) - the application stores no password |
| Cache / limits | Redis (cache, rate limiting, idempotency) |
| Frontend | Next.js (App Router), TypeScript, a BFF with an httpOnly cookie |
| Asynchronous | `notification-worker`, a separate deployable |
| Runtime | Docker Compose, multi-arch images (amd64 + arm64) |

## Structure

```
balaaca/
├── backend/              # Quarkus - the modular monolith (the business source of truth)
├── frontend/             # Next.js - public pages, dashboard, back office
├── notification-worker/  # drains the notifications table and sends
├── chatbot-service/      # a skeleton, calls the business API - never the database
├── infrastructure/       # docker, nginx, keycloak, postgres
├── docs/                 # architecture, database, security, ADRs
└── .claude/skills/       # the engineering conventions applied to this project
```

## Running locally

Prerequisites: Docker with Compose v2. Nothing else is needed for the
infrastructure stack.

```bash
cp .env.example .env
docker compose up -d
```

`.env` is gitignored. The values in `.env.example` are deliberately weak and
local: leaking them costs nothing. Production secrets come from the host's secret
store, never from a file in the repository.

| Service | Host | Role |
|---|---|---|
| PostgreSQL 18.6 | `127.0.0.1:55432` | source of truth, RLS forced |
| Redis 8.2 | `127.0.0.1:56379` | cache, rate limiting, idempotency |
| Keycloak 26.4 | `http://localhost:8180` | identity provider |

The host ports are not the default ones: a development machine often runs a
PostgreSQL on 5432, and the collision is silent until `compose` fails.
Everything is bound to `127.0.0.1`, never exposed on the network.

### PostgreSQL roles

`infrastructure/postgres/bootstrap.sh` runs once, when the volume is
initialised, and creates four least-privilege roles:

| Role | Use | Attributes |
|---|---|---|
| `balaaca_migrator` | owns the schema, runs Flyway | never used at runtime |
| `balaaca_app` | the application connection | neither owner nor `BYPASSRLS` - otherwise RLS would be inert |
| `balaaca_resolver` | owns the `SECURITY DEFINER` tenant resolution functions | `NOLOGIN`: never connected, only impersonated |
| `balaaca_registrar` | owns the only function that creates a provider | `NOLOGIN`, and distinct from the resolver: "what can bring a salon into being" has a single answer |
| `balaaca_notification_worker` | the notification worker | restricted to its own table |

The script is **idempotent**: each role is created only if absent, and an
existing role's password is never reapplied. On a VPS, container initialisation
only runs against an empty data directory, so **it has to be replayed by hand
before every deployment** - otherwise a migration that needs a new role fails,
and the application does not start. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Stopping

```bash
docker compose down        # keeps the data
docker compose down -v     # drops the PostgreSQL volume as well
```

## Development

The Git hooks are versioned in `.githooks/`. They are not active until you wire
them up, once per clone:

```bash
git config core.hooksPath .githooks
```

| Hook | Role |
|---|---|
| `commit-msg` | enforces the commit convention: a capitalised imperative subject of at most 50 characters, no `type(scope):` prefix, a body wrapped at 72, no `Co-Authored-By` trailer |
| `pre-push` | blocks direct pushes to `main` and to `develop`. With no override: GitHub refuses them server-side anyway, the hook only announces it earlier |
| `pre-commit` | runs `gitleaks` over the staged diff **if** the tool is installed, and stays quiet otherwise. Installing it is not a prerequisite: the authoritative scan runs in CI, over the full history, on every pull request |

These are pre-filters, not guarantees: `--no-verify` bypasses them. The
authoritative check is CI, which replays everything server-side.

### Running the tests

```bash
cd backend
mvn test      # unit tests only, fast, no Docker needed
mvn verify    # adds the *IT suites on Testcontainers
```

`notification-worker` is a separate Maven project, deliberately outside the
`backend` reactor: it depends on no Balaaca artifact. It is built and tested on
its own.

```bash
cd notification-worker
mvn verify
```

It does not start without a channel named explicitly:

```bash
balaaca.notification.channel=console
```

There is no default value, and that is deliberate. The only channel that exists
today writes to the log and sends nothing: a worker that marked rows `SENT` that
nobody received would be worse than a worker that refuses to start. No real
gateway is wired in - WhatsApp Business or an SMS aggregator is a commercial
decision, not a code detail.

On **macOS with Docker Desktop**, Testcontainers hangs on socket discovery
(`DockerClientProviderStrategy.getFirstValidStrategy`): it probes strategies that
lead nowhere without failing outright, which looks like a test that stopped
responding. Pointing it at the socket fixes it:

```bash
export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

Not needed on Linux runners, where the socket is in the standard place.

### The frontend

`frontend/` is a Next.js BFF. It holds every credential this product has and the
browser never sees one: pages are rendered on this server with the data already
in them, forms post to server actions, and the session is one httpOnly cookie
sealed with AES-256-GCM. There is no proxy route and no client-side call to the
API, so there is nowhere for an access token to leak to.

**To run the whole thing**, from the repository root:

```bash
scripts/dev.sh
```

It starts PostgreSQL, Keycloak and Redis in containers, builds the API the
first time and runs it, then the front, and prints the URLs. `scripts/dev-stop.sh`
stops it and keeps the data. Doing it by hand means remembering three overrides
that only apply to a local run - the database host, the OIDC issuer, and a media
root a developer can write to - and forgetting one fails in a way that does not
name itself.

The front on its own:

```bash
cd frontend
npm ci
npm run typecheck   # regenerates the API types from the OpenAPI document first
npm run test        # the wall-clock-to-instant conversion, where it can fail
npm run lint
npm run dev
```

### The brand

The logo is two files and no code:

| File | Where it shows |
|---|---|
| `frontend/public/brand/logo.svg` | header, footer, anything on ivory |
| `frontend/public/brand/logo-inverse.svg` | the dashboard sidebar and a provider's cover, both dark green |

Replace them and nothing else moves. What is there today is the mockup's own
mark, kept so nothing is empty - it is a placeholder, not a decision. It renders
at 26 px in the header, so a square or a circle works; a wide logo that already
carries the word "Balaaca" needs `MARK_CARRIES_THE_NAME` set to `true` in
`src/components/ui.tsx`, which drops the word rendered beside it.

`src/generated/` is written from `backend/app/src/main/resources/META-INF/openapi.yaml`
on every build and is **not committed**: a checked-in copy would be a second
statement of the contract that can drift from the first. Change a field in the
document and the pages that read it stop compiling, which is the only drift
check a client needs.

Two variables have to be set beyond what the stack already provides - see
`.env.example`:

| Variable | Role |
|---|---|
| `BALAACA_API_BASE_URL` | where this server reaches the API. Server-side only; the browser never addresses the backend |
| `BALAACA_SESSION_SECRET` | seals the session cookie. Rotating it signs everybody out, which is the correct behaviour |

The design is deliberately absent. The interfaces are being produced separately
and will replace `globals.css` and the markup wholesale; what is here is enough
to read a page and fill a form while the behaviour is proved.

### Identity

The realm is a versioned file, [`infrastructure/keycloak/realm-balaaca.json`](infrastructure/keycloak/realm-balaaca.json),
imported by compose at startup. An identity configuration nobody can recreate
poses the same problem as a schema with no migrations.

Three clients: `balaaca-backend` (a resource server, signs nobody in),
`balaaca-frontend` (confidential, driven by the Next.js BFF - the code is never
exchanged in the browser), and `balaaca-dev-cli` (public, password grant, **local
development only** - a production realm is provisioned separately and does not
carry it).

The file is a **template**: `balaaca-frontend` is confidential, and a secret in a
committed file is a leaked secret. `init-realm.sh` fills the `__VARIABLE__`
markers from the environment at startup, fails if a required variable is missing,
and refuses to start if an unresolved marker is left - without which the realm
would import the literal marker as a secret.

The same script then does what `--import-realm` cannot:

- **Create the client scopes.** Declaring them in the realm file **replaces**
  Keycloak's built-in set instead of adding to it, and the built-in `basic` scope
  carries the `sub` claim. Creating them after the import leaves the built-ins
  untouched, and avoids keeping a copy of them here that would go stale.
- **Update an existing client.** `--import-realm` leaves an already present realm
  as it is, so the secret and the scopes are reapplied on every startup: rotating
  a secret is a restart.

The container's probe waits on a sentinel written at the very end of
configuration, not just on `/health/ready`: that one goes green as soon as the
server boots, seconds before the scopes exist - long enough for a dependent
service to get a scopeless token and cache it for its whole lifetime.

After a `docker compose up`, this check says whether the realm issues a token the
API can actually use:

```bash
./infrastructure/keycloak/smoke.sh <user> <password>
```

It exists because a realm import can succeed and still be wrong. Declaring
`clientScopes` in a realm file **replaces** Keycloak's built-in set instead of
adding to it, and the built-in `basic` scope is the one that carries the `sub`
claim. Without it every token is valid, well signed - and carries no subject, so
tenant resolution finds nobody and every authenticated call answers 403. That is
exactly what happened the first time this realm was written.

### The public contract

`backend/app/src/main/resources/META-INF/openapi.yaml` **is** the API. The JAX-RS
interfaces and the transport-layer types are generated from it on every build,
into `target/generated-sources`, and are never committed: there is therefore no
copy that can drift, and the only way to change a signature is to change the
contract. A resource that no longer matches does not compile.

Annotation scanning is disabled (`mp.openapi.scan.disable=true`): what is
published is this file, not what the classpath happens to hold.

```bash
npx @stoplight/spectral-cli lint \
  backend/app/src/main/resources/META-INF/openapi.yaml --ruleset .spectral.yaml
```

CI reruns this lint and compares the document against `develop`'s with `oasdiff`:
inside `/v1`, only additive changes pass.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request to `develop` or `main`, and
on every push to those two branches. The chain fails fast: a job does not start
if the previous one is red.

| Job | Checks |
|---|---|
| `secrets` | `gitleaks` over the **full history** - a secret removed in a later commit stays compromised |
| `lint` | `shellcheck` on the hooks and the bootstrap; validity of `docker-compose.yml`; **every variable compose references is present in `.env.example`**; and the `commit-msg` hook still enforces the convention |
| `dependencies` | OSV-Scanner, with no API key |

Every action is pinned to a commit SHA, never to a tag: a tag is mutable and its
owner can silently repoint it. The `gitleaks` archive is verified against a
SHA-256 digest before it is run.

The Maven build, test, coverage, mutation and image jobs will arrive with the
code they check. A job that cannot fail is not a gate, and leaving one in place
would make CI look greener than it is.

Branches: `main` is the release branch, `develop` the integration branch and the
default one. Work happens on `feature/<slug>` (or `fix/`, `chore/`, `docs/`,
`ci/`) cut from `develop` and merged into `develop` by pull request. `develop` is
promoted to `main` at phase milestones, **by pull request as well**.

Both branches are protected server-side: a pull request is required, the three CI
checks are required, force-push and deletion are refused, and `enforce_admins` is
on - the repository owner is subject to it like everybody else. A direct push is
rejected with `GH006`, even with `--no-verify`.

## Documentation

| Document | Contents |
|---|---|
| [docs/adr/](docs/adr/) | the structural decisions and their reasons |
| [.claude/skills/CANONICAL.md](.claude/skills/CANONICAL.md) | the pinned symbols: tables, ports, exceptions, error codes, migration order, and the verified PostgreSQL behaviours |
| [.claude/skills/](.claude/skills/) | the engineering conventions applied to this project |
| [docs/adr/](docs/adr/) | architecture decisions and their reasons |

## Licence

Proprietary. All rights reserved.
