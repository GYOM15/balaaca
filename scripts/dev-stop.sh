#!/usr/bin/env bash
# Stops what dev.sh started. The containers keep their data: use
# `docker compose down -v` to drop the database as well.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

pkill -f 'next dev' 2>/dev/null && echo "front stopped"
pkill -f next-server 2>/dev/null
# Both jars, named apart. dev.sh starts two and they differ only by their path,
# so a pattern that matched "quarkus-run.jar" alone would stop the worker every
# time the API restarted - silently, because nothing sends anything anyway when
# the outbox has no drain.
pkill -f 'backend/app/target/quarkus-app/quarkus-run.jar' 2>/dev/null && echo "api stopped"
pkill -f 'notification-worker/target/quarkus-app/quarkus-run.jar' 2>/dev/null \
    && echo "worker stopped"
docker compose stop postgres keycloak redis mailpit >/dev/null 2>&1 \
    && echo "containers stopped"
echo "The data is kept."
