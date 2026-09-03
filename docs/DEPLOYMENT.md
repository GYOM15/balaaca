# Deployment

This is the file `infrastructure/postgres/bootstrap.sh` and migration `V014` name
explicitly. It did not exist, and its absence was half the problem it describes.

## The trap, once and for all

PostgreSQL roles cannot be created by a migration. `balaaca_migrator` is
`NOCREATEROLE`, deliberately: a role that can make roles can make a role without
RLS. The roles therefore come from `bootstrap.sh`, run as superuser.

But that script is mounted in `/docker-entrypoint-initdb.d`, and the PostgreSQL
image runs it **only against an empty data directory**. On a database that
already holds data, it never runs.

Consequence: any migration that needs a new role fails, and with
`quarkus.flyway.migrate-at-start=true`, **the application does not start at
all**.

## The rule

> Before every deployment, replay `bootstrap.sh` as superuser.

It is idempotent: each role is created only if absent, and an existing role's
password is never reapplied. Replaying it against an up-to-date database does
nothing.

```bash
docker compose exec -T postgres bash /docker-entrypoint-initdb.d/bootstrap.sh
```

The variables it needs are already in the container's environment, set by
compose. The role **names** are not among them: they are fixed, because the
migrations grant their privileges to those identifiers literally. A variable that
claimed to configure them produced a successful bootstrap followed by a Flyway
run failing on `role "balaaca_app" does not exist`; it has been removed.

If you forget, the migration does not leave you guessing:

```
ERROR: role balaaca_registrar does not exist
HINT:  This migration adds a role the cluster predates. Re-run
       infrastructure/postgres/bootstrap.sh as superuser - it is idempotent -
       then start the application again. See docs/DEPLOYMENT.md.
```

## The roles, and why there are five

| Role | What it can do | Why it is separate |
|---|---|---|
| `balaaca_migrator` | owns the schema, runs Flyway | never used at runtime |
| `balaaca_app` | the application connection | neither owner nor `BYPASSRLS`, otherwise RLS is inert |
| `balaaca_resolver` | `NOLOGIN`, owns the resolution functions, **read only** | resolving a tenant before a tenant is bound |
| `balaaca_registrar` | `NOLOGIN`, owns the only function that creates a provider | "what can bring a salon into being" has a single answer |
| `balaaca_notification_worker` | `SELECT`/`UPDATE` on `notifications`, nothing else | a drain bug does not become a cross-tenant leak |

## The order of a deployment

1. `git pull` on the target machine.
2. **`bootstrap.sh`** (above). Always, even if nothing seems to have changed.
3. Rebuild and restart: Flyway applies the migrations at startup.
4. `infrastructure/keycloak/smoke.sh` - checks that a real token carries a `sub`,
   the right audience and the expected scopes. A realm that starts is not a realm
   that works.

## The published images

They live in a mounted directory, named by `BALAACA_MEDIA_ROOT` (default
`/var/lib/balaaca/media`). That is honest rather than ideal, and it is better
said out loud:

- **a single instance.** A second instance would not see the first one's files;
- **nothing in front.** The application serves its own bytes, which is a CDN's
  job;
- **back it up separately.** The directory is not part of the PostgreSQL dump,
  and a database restored without it points at images that are not there.

The database stores a **name**, never a URL, and access goes through a port. The
day this becomes object storage, it is an adapter that changes, not the schema
and not the rows already written.

## The container images

Three, built from this repository and published to GitHub Packages:

| Image | What it is | Ports |
| --- | --- | --- |
| `ghcr.io/gyom15/balaaca-api` | the business API | 8080 app, 9000 metrics |
| `ghcr.io/gyom15/balaaca-worker` | the outbox drain | 8090 app, 9100 metrics |
| `ghcr.io/gyom15/balaaca-web` | the front end, which is also the BFF | 3000 |

They are **public**, which is free storage and free bandwidth on GitHub's free
plan; private packages there are capped at 500 MB, and these three exceed that.
Nothing secret is inside one: every credential arrives as environment at run
time, and none is a build argument, because a build argument is readable in the
image's own history by anyone who can pull it.

Built from the repository root, for the architecture of the machine that will
run them:

```
docker build --platform linux/arm64 -f docker/api.Dockerfile    -t ghcr.io/gyom15/balaaca-api:latest .
docker build --platform linux/arm64 -f docker/worker.Dockerfile -t ghcr.io/gyom15/balaaca-worker:latest .
docker build --platform linux/arm64 -f docker/web.Dockerfile    -t ghcr.io/gyom15/balaaca-web:latest .
```

`linux/arm64` is a Raspberry Pi running a 64-bit system, which is what `uname
-m` reports as `aarch64`. A Pi on a 32-bit system reports `armv7l` and none of
these will run on it. A VPS is `x86_64`, and wants `linux/amd64`.

Tests do not run inside these builds. CI is the authority and an image is built
from a commit it has passed; re-running the suites in every image build would
add minutes to each one to prove what is already proven, and the integration
tests need a Docker socket that a build does not have.

## Running it, on the Pi

The images carry the application. They do not carry the compose file, the
Keycloak theme, the realm template, `bootstrap.sh` or the Prometheus
configuration - all of which are mounted from the repository. So the machine
needs a checkout as well as a pull:

```
git pull
docker login ghcr.io                       # once, with a personal access token
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

`.env` must name addresses a BROWSER can reach, which on a Pi is the machine on
your network and never `localhost` - localhost on a visitor's telephone is the
telephone:

```
APP_PUBLIC_ORIGIN=http://balaaca.local:3000
KEYCLOAK_PUBLIC_URL=http://balaaca.local:8180
KEYCLOAK_ISSUER_URL=http://balaaca.local:8180/realms/balaaca
FRONTEND_ORIGIN=http://balaaca.local:3000
FRONTEND_REDIRECT_URI=http://balaaca.local:3000/*
```

**This is not a public deployment and must not be made one as it stands.**
Keycloak still runs `start-dev`: no HTTPS, relaxed hostname checks. There is no
TLS anywhere in the stack, and the session cookie is not marked `Secure`
precisely because there is no HTTPS to mark it for. On a home network behind a
router that forwards nothing, that is a beta. On the open internet it is an
account takeover waiting for someone to read one packet.

## What does not exist yet

Stated here rather than discovered on a Sunday:

- **no deployment pipeline.** CI builds, tests and checks the contract; nothing
  pushes anything to the VPS. Deployment is manual.
- **no documented backup.** There is no scheduled `pg_dump` and no tested
  restore.
- **no alerting** on notifications that turned `DEAD`, in the sense of an alerting
  system. The worker now logs every death at `ERROR`, with the `provider_id`, the
  kind and the dedupe key (never the recipient), which is enough for a search but
  not enough to wake anybody:

  ```
  notification.dead id=... provider_id=... kind=BOOKING_CONFIRMATION
                    dedupe_key=... code=... attempts=5
  ```
