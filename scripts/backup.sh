#!/usr/bin/env bash
# Takes one backup: the database, and the images the database only names.
#
#   scripts/backup.sh                    # into ./backups
#   scripts/backup.sh --into /mnt/disk   # somewhere else
#   scripts/backup.sh --keep 30          # how many to leave behind
#
# Restore with scripts/restore.sh, and READ that one before you need it.
#
# What this protects against, on the machine it runs on: a migration that ate
# something, a DELETE with the wrong WHERE, a deployment that went badly. What
# it does NOT protect against is the disk dying, because the copy is on the same
# disk. Saying so is the point - a backup whose limits nobody stated is a backup
# somebody will rely on for the case it does not cover. Off-site comes with the
# object store, and the images are the same conversation (docs/BACKLOG.md).
#
# Two artefacts and not one. The dump does not carry the media directory, and
# the media directory means nothing without the rows that name each file: a
# restore of either alone leaves a page pointing at nothing, or files nobody can
# reach. They are written under one timestamp so a pair is obvious.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=.env.prod
INTO=backups
KEEP=14

while [ $# -gt 0 ]; do
    case "$1" in
        --into)     INTO="$2"; shift 2 ;;
        --keep)     KEEP="$2"; shift 2 ;;
        --env-file) ENV_FILE="$2"; shift 2 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

if [ ! -f "$ENV_FILE" ]; then
    echo "$ENV_FILE is missing. This runs on the deployment, not on a laptop." >&2
    exit 1
fi
# shellcheck source=/dev/null
set -a
# shellcheck source=/dev/null
. "./$ENV_FILE"
set +a

# The superuser is POSTGRES_SUPERUSER in the env file and POSTGRES_USER inside
# the container, because docker-compose.yml maps one onto the other. Reading the
# container's name out here found nothing and fell back to `postgres`, which is
# right today and right by accident: the day that value is anything else, this
# would have dumped as a user that does not exist, and the fallback is what
# would have hidden it.
DB_USER="${POSTGRES_SUPERUSER:-${POSTGRES_USER:-postgres}}"
DB_NAME="${POSTGRES_DB:-balaaca}"

COMPOSE=(docker compose --env-file "$ENV_FILE"
         -f docker-compose.yml -f docker-compose.prod.yml)

if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx postgres; then
    echo "postgres is not running, so there is nothing to dump." >&2
    exit 1
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$INTO"
DUMP="$INTO/balaaca-$STAMP.dump"
MEDIA="$INTO/balaaca-$STAMP-media.tar.gz"

# --format=custom, so restore.sh can be selective and parallel, and so the file
# is compressed without a second tool. Plain SQL would restore with psql and
# would be one long transaction nobody can steer.
#
# Written to a temporary name and moved into place at the end: a dump
# interrupted halfway is a file of the right name and the wrong length, and the
# day it is needed is the day nobody checks.
echo "==> database"
"${COMPOSE[@]}" exec -T postgres \
    pg_dump --username "$DB_USER" --dbname "$DB_NAME" \
            --format=custom --compress=6 > "$DUMP.part"
mv "$DUMP.part" "$DUMP"

# The volume, through a throwaway container, because the files belong to the
# API's user and live in a named volume rather than on the host.
echo "==> images"
docker run --rm \
    -v "$(docker volume ls -q -f name='balaaca-media$' | head -1):/data:ro" \
    -v "$PWD/$INTO:/out" \
    alpine:3.20 tar -czf "/out/$(basename "$MEDIA").part" -C /data . 
mv "$MEDIA.part" "$MEDIA"

# Oldest first, and the pair is kept or dropped together: a dump whose media is
# gone restores a catalogue of broken images, which looks like a bug in the
# product rather than a gap in the backup.
if [ "$KEEP" -gt 0 ]; then
    ls -1t "$INTO"/balaaca-*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
        echo "==> dropping $(basename "$old")"
        rm -f "$old" "${old%.dump}-media.tar.gz"
    done
fi

echo
echo "    $DUMP"
echo "    $MEDIA"
echo "    $(ls -1 "$INTO"/balaaca-*.dump 2>/dev/null | wc -l | tr -d ' ') kept, restore with scripts/restore.sh"
