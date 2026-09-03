#!/usr/bin/env bash
# Brings the whole stack up on this machine, in one command.
#
# There are four moving parts and they have to start in order: PostgreSQL and
# Keycloak in containers, the API as a jar against them, and the front against
# the API. Doing it by hand means remembering three environment overrides that
# only apply to a local run, and forgetting one of them fails in a way that
# does not name itself - a media upload answering 500, or the API resolving
# "postgres" to nothing.
#
# Stop it all with scripts/dev-stop.sh.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
LOGS="$ROOT/.dev-logs"
mkdir -p "$LOGS"

if [ ! -f .env ]; then
    echo ".env is missing. Copy it: cp .env.example .env" >&2
    exit 1
fi
# shellcheck source=/dev/null
set -a; . ./.env; set +a

# --- What is only true locally ----------------------------------------------
# .env describes the container network, where the API calls itself "postgres".
# Started here, it goes through the port published on this machine.
export POSTGRES_HOST=localhost
export POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-55432}"
# Same for Redis, and it shows up worse: nothing the product does today goes
# through it, so the API answers everything and only reports /q/health/ready
# DOWN. A readiness wait then spins for two minutes and gives up explaining
# nothing.
export REDIS_HOST=localhost
export REDIS_HOST_PORT="${REDIS_HOST_PORT:-56379}"
export QUARKUS_OIDC_AUTH_SERVER_URL="${KEYCLOAK_ISSUER_URL}"
export QUARKUS_HTTP_PORT="${BACKEND_PORT:-8080}"
# The production default is /var/lib/balaaca/media, where a developer cannot
# write. Without this line, the first logo upload answers 500 saying nothing.
export BALAACA_MEDIA_ROOT="${BALAACA_MEDIA_ROOT_LOCAL:-$ROOT/.dev-media}"
mkdir -p "$BALAACA_MEDIA_ROOT"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# --- 1. The infrastructure --------------------------------------------------
say "1/4  PostgreSQL, Keycloak and Redis"
docker compose up -d postgres keycloak redis

printf '     keycloak '
for _ in $(seq 1 60); do
    state=$(docker inspect --format '{{.State.Health.Status}}' "${COMPOSE_PROJECT_NAME:-balaaca}-keycloak-1" 2>/dev/null || echo starting)
    [ "$state" = healthy ] && break
    printf '.'; sleep 5
done
echo " ready"

# --- 2. The API -------------------------------------------------------------
JAR="$ROOT/backend/app/target/quarkus-app/quarkus-run.jar"

# Anything the jar is built FROM. Kept in one place because the interesting
# failure is a source this list forgets: it would be newer than the jar, the
# jar would not be rebuilt, and the difference would show up as behaviour that
# does not match the code in front of you.
sources_newer_than() {
    find backend \
        -path '*/target' -prune -o \
        -type f \( -name '*.java' -o -name '*.sql' -o -name '*.yaml' \
                   -o -name '*.yml' -o -name '*.properties' \) \
        -newer "$1" -print -quit
}

# Rebuild when a source is newer than the jar, and not only when the jar is
# missing. This checked for absence alone, which is the half that never bites:
# what bites is a jar built BEFORE the code it is meant to run, or - worse -
# rebuilt UNDER a process that is already up. Quarkus reads a fast-jar's
# classes lazily, so such a process ends up mixing two builds, and a CDI proxy
# calls a constructor its own class no longer has. Nothing says "stale": it
# surfaces as a 500 with no compilation error and no migration error anywhere
# near it, which cost hours once already.
# `clean`, and it is not caution. Maven copies src/main/resources into
# target/classes and NEVER removes what is no longer there, so a file deleted
# from the sources stays in the jar. That is not hypothetical twice over: a
# throwaway probe and a throwaway migration both shipped that way, and the
# migration was APPLIED to a live database by a jar built from sources that no
# longer contained it. Flyway then refused every subsequent start, against a
# history row nothing could explain.
if [ ! -f "$JAR" ]; then
    say "2/4  The API is not built yet, building it"
    (cd backend && mvn -q -pl app -am -DskipTests -Djacoco.skip=true clean package)
elif [ -n "$(sources_newer_than "$JAR")" ]; then
    say "2/4  The API changed since it was built, rebuilding it"
    (cd backend && mvn -q -pl app -am -DskipTests -Djacoco.skip=true clean package)
else
    say "2/4  The API"
fi

# When this script last started an API. A marker file rather than the process
# start time: reading that portably means /proc on Linux and parsing `ps` on
# macOS, and a check that is only right on one of them is worse than no check.
# Two file dates compare the same way everywhere.
STARTED="$LOGS/.api-started"

# A running API older than the jar it is meant to be running is the state above,
# already happening. It is restarted three lines down whatever we say, so all
# this has to do is NAME it - the person who rebuilt by hand and did not restart
# has no other way to learn that what answered them was not their code.
if pgrep -f quarkus-run.jar >/dev/null 2>&1 \
   && [ -f "$STARTED" ] && [ "$JAR" -nt "$STARTED" ]; then
    echo "     the API that is running predates this jar - restarting it" >&2
fi

pkill -f quarkus-run.jar 2>/dev/null || true
nohup java -jar "$JAR" > "$LOGS/api.log" 2>&1 &
touch "$STARTED"

printf '     api '
ready=no
for _ in $(seq 1 45); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$QUARKUS_HTTP_PORT/q/health/ready" || true)
    if [ "$code" = 200 ]; then ready=yes; break; fi
    printf '.'; sleep 2
done
if [ "$ready" = yes ]; then
    echo " ready"
else
    # Say WHAT went down, not merely that the wait expired: the body of
    # /q/health/ready names the check at fault - and when the API never got far
    # enough to answer at all, the last ERROR it logged does.
    echo " not ready"
    curl -s "http://localhost:$QUARKUS_HTTP_PORT/q/health/ready" || true
    echo
    echo "     The API did not start. The last error it logged:" >&2
    # The cause chain, not just the top line. "Failed to start quarkus" names
    # nothing; the cause underneath it is where a Flyway checksum mismatch, a
    # role that does not exist, or a port already taken actually says so.
    python3 - "$LOGS/api.log" >&2 <<'PY' || tail -3 "$LOGS/api.log" >&2
import json, sys
last = None
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    if not line.startswith("{"):
        continue
    try:
        row = json.loads(line)
    except ValueError:
        continue
    if row.get("level") == "ERROR":
        last = row
if last is None:
    raise SystemExit(1)
print("       " + last.get("message", ""))
seen = last.get("exception")
while seen:
    text = (seen.get("message") or "").replace("\n", "\n       ")
    if text:
        print("       " + seen.get("exceptionType", "") + ": " + text)
    seen = (seen.get("causedBy") or {}).get("exception")
PY
    echo "     The whole log is in $LOGS/api.log" >&2
    exit 1
fi

# --- 3. The front -----------------------------------------------------------
say "3/4  The front"
if [ ! -d frontend/node_modules ]; then
    (cd frontend && npm ci)
fi
pkill -f 'next dev' 2>/dev/null || true
pkill -f next-server 2>/dev/null || true
export BALAACA_API_BASE_URL="${BALAACA_API_BASE_URL:-http://localhost:$QUARKUS_HTTP_PORT}"
(cd frontend && nohup npm run dev > "$LOGS/front.log" 2>&1 &)

printf '     front '
for _ in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ || true)
    [ "$code" = 200 ] && break
    printf '.'; sleep 2
done
echo " ready"

say "4/4  Everything is up"
cat <<EOF
     The site       http://localhost:3000
     A page         http://localhost:3000/p/salon-fatou
     The diary      http://localhost:3000/dashboard
     The API        http://localhost:$QUARKUS_HTTP_PORT/q/health/ready
     Keycloak       ${KEYCLOAK_ISSUER_URL%/realms/*}

     The logs       $LOGS/api.log  and  $LOGS/front.log
     To stop        scripts/dev-stop.sh
     Some data      scripts/seed.sh
EOF
