#!/usr/bin/env bash
# Stops what dev.sh started. The containers keep their data: use
# `docker compose down -v` to drop the database as well.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

pkill -f 'next dev' 2>/dev/null && echo "front stopped"
pkill -f next-server 2>/dev/null
pkill -f quarkus-run.jar 2>/dev/null && echo "api stopped"
docker compose stop postgres keycloak redis >/dev/null 2>&1 && echo "containers stopped"
echo "The data is kept."
