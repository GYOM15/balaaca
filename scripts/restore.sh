#!/usr/bin/env bash
# Puts a backup back. The half that matters, and the half nobody tests.
#
#   scripts/restore.sh backups/balaaca-20260913T041200Z.dump
#   scripts/restore.sh --database-only <dump>
#
# THIS DESTROYS what is there now. It drops the schema and rebuilds it from the
# dump, and it replaces the media volume's contents. There is a prompt; there is
# also --yes, which is for a cron nobody should write.
#
# Rehearse it. A backup that has never been restored is a file, not a backup,
# and the moment to find out that the roles are missing or the volume name is
# wrong is not the morning the disk died. Today the Pi is a test machine and its
# data is disposable, which makes this exactly the right time to run it for
# real: restore over the top, watch it work, and know it does.
#
# The API is stopped first and started last. Flyway runs at startup, so an API
# left running against a schema being dropped under it either dies or, worse,
# reapplies migrations onto a half-restored database.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=.env.prod
YES=no
DATABASE_ONLY=no
DUMP=""

while [ $# -gt 0 ]; do
    case "$1" in
        --yes)           YES=yes; shift ;;
        --database-only) DATABASE_ONLY=yes; shift ;;
        --env-file)      ENV_FILE="$2"; shift 2 ;;
        -*) echo "unknown option: $1" >&2; exit 2 ;;
        *)  DUMP="$1"; shift ;;
    esac
done

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
    echo "usage: scripts/restore.sh <dump> [--database-only] [--yes]" >&2
    echo "available:" >&2
    ls -1t backups/balaaca-*.dump 2>/dev/null | head -5 | sed 's/^/    /' >&2
    exit 2
fi

MEDIA="${DUMP%.dump}-media.tar.gz"
if [ "$DATABASE_ONLY" = no ] && [ ! -f "$MEDIA" ]; then
    # Refused rather than warned. A database restored without its images is a
    # catalogue of broken pictures, which reads as a bug in the product and
    # sends somebody debugging the wrong thing for an afternoon.
    echo "$MEDIA is missing beside the dump." >&2
    echo "Pass --database-only if you really mean to leave the images alone." >&2
    exit 1
fi

# shellcheck source=/dev/null
set -a
# shellcheck source=/dev/null
. "./$ENV_FILE"
set +a

COMPOSE=(docker compose --env-file "$ENV_FILE"
         -f docker-compose.yml -f docker-compose.prod.yml)

if [ "$YES" != yes ]; then
    echo "This replaces the database ${POSTGRES_DB:-balaaca} and the images, from"
    echo "    $DUMP"
    printf 'Type the database name to confirm: '
    read -r answer
    [ "$answer" = "${POSTGRES_DB:-balaaca}" ] || { echo "not confirmed."; exit 1; }
fi

echo "==> stopping the application"
"${COMPOSE[@]}" stop api worker web >/dev/null

echo "==> database"
"${COMPOSE[@]}" up -d postgres >/dev/null
# Waited for rather than assumed: `up -d` returns when the container is started,
# not when the server accepts connections, and pg_restore against a socket that
# is not listening yet fails in a way that reads like a corrupt dump.
for _ in $(seq 1 30); do
    "${COMPOSE[@]}" exec -T postgres pg_isready -q && break
    sleep 2
done

# --clean --if-exists drops what it is about to recreate, so this is a REPLACE
# and not a merge onto whatever was there. Not --create: the database already
# exists and dropping it would take the roles' grants with it.
#
# And NOT --no-owner, which this had and which a rehearsal caught. It moved all
# twenty-two tables from balaaca_migrator to postgres, silently and with every
# row intact - so the restore looked perfect. Flyway connects as
# balaaca_migrator, which would no longer own what it has to ALTER, and the
# failure would have arrived on the NEXT deployment, as a migration error nobody
# would connect to a restore that went fine weeks earlier.
#
# The exit status is deliberately not trusted on its own. pg_restore reports a
# non-zero status for warnings a restore survives - an owner it cannot set, an
# extension it cannot recreate - and treating those as failure teaches an
# operator to ignore the status entirely, which is worse.
set +e
"${COMPOSE[@]}" exec -T postgres \
    pg_restore --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-balaaca}" \
               --clean --if-exists < "$DUMP"
status=$?
set -e
[ "$status" -eq 0 ] || echo "    pg_restore exited $status - read the lines above before trusting this"

if [ "$DATABASE_ONLY" = no ]; then
    echo "==> images"
    volume=$(docker volume ls -q -f name='balaaca-media$' | head -1)
    [ -n "$volume" ] || { echo "no balaaca-media volume on this machine." >&2; exit 1; }
    docker run --rm -v "$volume:/data" -v "$PWD/$(dirname "$MEDIA"):/in:ro" \
        alpine:3.20 sh -c "rm -rf /data/* && tar -xzf /in/$(basename "$MEDIA") -C /data"
fi

echo "==> starting the application"
"${COMPOSE[@]}" up -d >/dev/null

# What was actually restored, in numbers, because "done" is not evidence. A
# dump that restored zero providers restored nothing, and the counts are the
# cheapest way to see that before walking away.
echo
"${COMPOSE[@]}" exec -T postgres psql -qtA \
    --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-balaaca}" -c "
    SELECT '    providers:    ' || count(*) FROM providers
    UNION ALL SELECT '    appointments: ' || count(*) FROM appointments
    UNION ALL SELECT '    reviews:      ' || count(*) FROM provider_reviews
    UNION ALL SELECT '    audit lines:  ' || count(*) FROM audit_logs" 2>/dev/null || true
echo
echo "    Check the site before you walk away."
