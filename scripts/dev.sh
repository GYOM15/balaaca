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
    echo "Il manque .env. Copiez-le : cp .env.example .env" >&2
    exit 1
fi
# shellcheck source=/dev/null
set -a; . ./.env; set +a

# --- Ce qui n'est vrai qu'en local ------------------------------------------
# .env decrit le reseau des conteneurs, ou l'API s'appelle "postgres". Lancee
# ici, elle passe par le port publie sur la machine.
export POSTGRES_HOST=localhost
export POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-55432}"
# Meme chose pour Redis, et il se manifeste plus mal : rien de ce que le
# produit fait aujourd'hui ne passe par lui, donc l'API repond a tout et
# declare seulement /q/health/ready DOWN. Une attente de readiness tourne alors
# deux minutes dans le vide avant d'abandonner sans rien expliquer.
export REDIS_HOST=localhost
export REDIS_HOST_PORT="${REDIS_HOST_PORT:-56379}"
export QUARKUS_OIDC_AUTH_SERVER_URL="${KEYCLOAK_ISSUER_URL}"
export QUARKUS_HTTP_PORT="${BACKEND_PORT:-8080}"
# Le defaut de production est /var/lib/balaaca/media, ou un developpeur n'ecrit
# pas. Sans cette ligne, le premier envoi de logo repond 500 sans dire pourquoi.
export BALAACA_MEDIA_ROOT="${BALAACA_MEDIA_ROOT_LOCAL:-$ROOT/.dev-media}"
mkdir -p "$BALAACA_MEDIA_ROOT"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# --- 1. L'infrastructure ----------------------------------------------------
say "1/4  PostgreSQL, Keycloak et Redis"
docker compose up -d postgres keycloak redis

printf '     keycloak '
for _ in $(seq 1 60); do
    state=$(docker inspect --format '{{.State.Health.Status}}' "${COMPOSE_PROJECT_NAME:-balaaca}-keycloak-1" 2>/dev/null || echo starting)
    [ "$state" = healthy ] && break
    printf '.'; sleep 5
done
echo " pret"

# --- 2. L'API ---------------------------------------------------------------
JAR="$ROOT/backend/app/target/quarkus-app/quarkus-run.jar"
if [ ! -f "$JAR" ]; then
    say "2/4  L'API n'est pas construite, je la construis (une fois)"
    (cd backend && mvn -q -pl app -am -DskipTests -Djacoco.skip=true package)
else
    say "2/4  L'API"
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
    echo " prete"
else
    # Dire QUOI est tombe, et pas seulement que l'attente a expire : la sortie
    # de /q/health/ready nomme le controle en cause.
    echo " pas prete"
    curl -s "http://localhost:$QUARKUS_HTTP_PORT/q/health/ready" || true
    echo
    echo "     Le detail est dans $LOGS/api.log" >&2
    exit 1
fi

# --- 3. Le front ------------------------------------------------------------
say "3/4  Le front"
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
echo " pret"

say "4/4  Tout tourne"
cat <<EOF
     Le site        http://localhost:3000
     Une page       http://localhost:3000/p/salon-fatou
     Le carnet      http://localhost:3000/dashboard
     L'API          http://localhost:$QUARKUS_HTTP_PORT/q/health/ready
     Keycloak       ${KEYCLOAK_ISSUER_URL%/realms/*}

     Les journaux   $LOGS/api.log  et  $LOGS/front.log
     Pour arreter   scripts/dev-stop.sh
EOF
