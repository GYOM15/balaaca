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
docker compose exec -T postgres bash /docker-entrypoint-initdb.d/10-bootstrap.sh
```

The mounted name is not the repository's name. Compose mounts
`infrastructure/postgres/bootstrap.sh` as `/docker-entrypoint-initdb.d/10-bootstrap.sh`,
because the image runs that directory in lexical order. This page said
`bootstrap.sh` for a while and the command answered "No such file or directory",
which is a poor thing to discover while an application will not start.

You will rarely type it: `scripts/deploy.sh` runs it for you, at the only moment
it is any use.

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
| `balaaca_moderator` | `NOLOGIN`, owns the review and moderation functions | the only role that sees a hidden review or reads across tenants |

No provider is a database role, and none ever will be. A business is a row in
`providers`; what keeps one out of another's data is row-level security on the
single `balaaca_app` connection, forced on every table that carries a
`provider_id`. Only `postgres` is a superuser, and nothing runs as it.

## Who may open the back office

`/admin` and the nine `/v1/admin` routes require the role `admin:moderation`,
which **nobody holds by default and no client grants**.

The distinction matters more than it looks. Roles reach the API from the token's
`scope` claim, and a Keycloak *client scope* belongs to a client: the six
provider scopes are optional on `balaaca-frontend`, so any account signing in
through it may ask for them. Harmless there - what confines a provider is
row-level security and the tenant bound server-side. Fatal on the admin routes,
where the scope IS the guard: published as a client scope, every provider on the
platform could have requested it and suspended anybody.

So the grant is a **realm role on one named account**. `init-realm.sh` creates
`platform-admin` and assigns it to no one; `PlatformOperatorAugmentor` turns it
into the scope the routes check.

To grant it, on the deployment:

```
scripts/grant-operator.sh somebody@example.com
scripts/grant-operator.sh --revoke somebody@example.com
scripts/grant-operator.sh --list
```

The account must exist first: a support person signs up like anybody else and
simply creates no business, and you promote them afterwards. Nobody types
anybody else's password.

It reads back what it did, because `add-roles` and `remove-roles` both succeed
in SILENCE - a typo in an address is refused loudly, while a grant that changed
nothing is not. And it says out loud that the person has to sign out and back
in: a token already issued does not gain a role granted after it.

This was four commands copied out of a chat window until it was a script, and
two of them failed in ways that named something else. If you ever run them by
hand, the traps are: a bare `docker compose` reads `.env`, which does not exist
on a deployment, so every variable resolves to empty while it still finds the
container by name; and the credentials line must be expanded by the CONTAINER's
shell, or Keycloak is handed an empty user and an empty password.

### `Role not found for name: platform-admin`

The role has to exist before it can be granted, and it arrives by a different
road from the code that reads it. Two halves, and BOTH are needed before
`/admin` opens:

- **The role** is created by `init-realm.sh`, which is this container's
  entrypoint and is BIND MOUNTED from the checkout. So it appears after a
  `git pull` and a restart of that container, with no image involved.
  `deploy.sh` now does that restart itself, and only when the pull actually
  changed that file.
- **The translation** from that realm role to the `admin:moderation` the routes
  check lives in `PlatformOperatorAugmentor`, inside the API image. That one
  needs `scripts/publish-images.sh` on the build machine and `scripts/deploy.sh`
  here.

Grant the role against an API that predates the augmentor and the token will
carry `platform-admin` faithfully while every admin route still answers 403 -
which looks like the grant failed, and it did not. Deploy first, then grant.

`remove-roles`, same arguments, takes it away. The account must exist first: a
support person signs up like anybody else and simply creates no business, and
you promote them afterwards. Nobody types anybody else's password.

Every write those routes perform lands in `audit_logs` with `actor_role` set to
`OPERATOR` - suspension, reinstatement, a report marked reviewed, a contestation
read, a review hidden or restored, a business's reply cleared. There is no
screen for it yet; read it with `psql` until there is more than one operator:

```
$COMPOSE exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT occurred_at, action, entity_id, metadata FROM audit_logs \
    WHERE actor_role = '"'"'OPERATOR'"'"' ORDER BY occurred_at DESC LIMIT 50"'
```

Same `$COMPOSE` as above, and the same reason for the single quotes: the
database name and the superuser are the container's, not the host's.

`actor_ip` stays NULL, deliberately, and will until there is somebody other than
you clicking.

## Backups, and the half that matters

```
scripts/backup.sh                    # into ./backups, keeping fourteen
scripts/restore.sh backups/<file>    # THIS DESTROYS what is there now
```

Two artefacts per run, under one timestamp: a custom-format `pg_dump` and a tar
of the media volume. Neither means anything without the other - the rows name
the files, and a database restored without its images is a catalogue of broken
pictures that reads like a bug in the product. `restore.sh` refuses to run
without the pair unless you pass `--database-only` and say you meant it.

**Rehearse it now, while the data is disposable.** A backup that has never been
restored is a file, not a backup, and the morning the disk dies is the wrong
morning to learn that. That rehearsal has already earned itself once: the
restore carried `--no-owner`, which moved all twenty-two tables from
`balaaca_migrator` to `postgres` with every row intact - so it looked perfect,
and the NEXT deployment would have failed on a migration, weeks later, with
nobody connecting the two.

```
scripts/backup.sh
scripts/restore.sh backups/$(ls -1t backups/*.dump | head -1 | xargs basename)
```

It prints what it restored, in counts. Zero providers means it restored nothing.

Nightly, at three in the morning, in the deploying user's crontab:

```
0 3 * * * cd /home/guy-olivier/balaaca && scripts/backup.sh >> backups/backup.log 2>&1
```

`--keep` decides how many pairs stay; the default is fourteen and they are
dropped in pairs, because a dump whose media is gone restores broken images.

## Which build is running

The commit is a LABEL on each image, put there by `publish-images.sh`:

```
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    ghcr.io/gyom15/balaaca-api:latest
```

`unknown` means somebody built it by hand without `--build-arg BALAACA_REVISION`.
That is honest; a wrong answer would not be.

There was a `/q/build-info` endpoint for this and it has been removed. It
returned the Maven version, `0.1.0-SNAPSHOT`, identical on every build ever
made, while its own comment said it confirmed which build was running - and the
first time somebody needed the answer, it had none. The label replaces it rather
than the endpoint returning a real value, because this repository is public:
publishing which commit is deployed tells anybody which known issues are not
fixed here. A label is read by whoever has a shell on the host, which is
whoever is asking.

## The order of a deployment

1. `git pull` on the target machine.
2. **`bootstrap.sh`** (above). Always, even if nothing seems to have changed.
3. Rebuild and restart: Flyway applies the migrations at startup.

`scripts/deploy.sh` performs 1 to 3, in that order, and the order is the whole
reason it exists. Step 2 has to happen while PostgreSQL is up and the API is
NOT: bringing the stack up first and running bootstrap afterwards is too late,
because the API has already tried to migrate and died. The script brings
PostgreSQL up alone, replays bootstrap against it, and only then starts
everything else. Run the script rather than the steps.
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

One command, from the machine that can build natively:

```
scripts/publish-images.sh                          # for a Raspberry Pi
scripts/publish-images.sh --platform linux/amd64   # for a VPS
scripts/publish-images.sh --dry-run                # say what would happen
```

It refuses before it starts rather than failing halfway, on the things that are
knowable: not on `main`, not level with `origin/main`, uncommitted changes under
`backend/`, `frontend/` or `docker/`, a daemon that is not answering.

Disk space is REPORTED, not enforced. How much a build needs depends on what the
layer cache already holds, and a threshold picked without measuring it would
refuse runs that would have finished. What is worth having is the right
explanation afterwards: a disk that fills does not fail the build, it kills the
daemon, and the message that surfaces then is "cannot connect to the Docker
daemon" - which sends you to restart Docker rather than to free space. The
script says so when it actually happens. `--min-free N` adds a gate for anybody
who wants one.

The tag is computed, never typed, and by the same function `deploy.sh` uses:
`scripts/lib/image-tag.sh`. That is the whole reason the file exists. The two
scripts run on different machines days apart, and if their idea of the tag ever
diverges, the deployment pulls something nobody published - and `deploy.sh`'s
own failure message does not name that as a possibility.

The images are pushed only after all three have built. A half-published set is a
deployment that pulls two new images and one old one, which starts and is
wrong.

By hand, if you ever need to see what it does:

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
docker login ghcr.io                       # once, with a personal access token
scripts/deploy.sh                          # the images matching this checkout
scripts/deploy.sh --tag latest             # or whatever latest points at
```

This page used to list the four compose commands the script wraps. They brought
the whole stack up at once and never replayed bootstrap, which is the failure
this document opens with. The script is not a convenience over them; it is the
order they were missing.

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
- **no OFF-SITE backup.** `scripts/backup.sh` and `scripts/restore.sh` exist and
  the restore has been rehearsed, but the copy lands on the same disk as the
  thing it copies: it survives a bad migration, a wrong `DELETE` and a
  deployment that went badly, and not the disk dying. Off-site arrives with the
  object store, which the images are waiting for too (docs/BACKLOG.md).
- **no alerting** on notifications that turned `DEAD`, in the sense of an alerting
  system. The worker now logs every death at `ERROR`, with the `provider_id`, the
  kind and the dedupe key (never the recipient), which is enough for a search but
  not enough to wake anybody:

  ```
  notification.dead id=... provider_id=... kind=BOOKING_CONFIRMATION
                    dedupe_key=... code=... attempts=5
  ```
