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
