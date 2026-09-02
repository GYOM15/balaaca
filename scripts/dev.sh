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
if [ ! -f "$JAR" ]; then
    say "2/4  The API is not built yet, building it (once)"
    (cd backend && mvn -q -pl app -am -DskipTests -Djacoco.skip=true package)
else
    say "2/4  The API"
fi

pkill -f quarkus-run.jar 2>/dev/null || true
nohup java -jar "$JAR" > "$LOGS/api.log" 2>&1 &

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
    # /q/health/ready names the check at fault.
    echo " not ready"
    curl -s "http://localhost:$QUARKUS_HTTP_PORT/q/health/ready" || true
    echo
    echo "     The detail is in $LOGS/api.log" >&2
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
