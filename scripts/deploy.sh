#!/usr/bin/env bash
# Deploys this checkout on the machine it is run from.
#
#   scripts/deploy.sh                # the images matching this checkout
#   scripts/deploy.sh --tag latest   # whatever latest points at
#
# It exists for the ORDER, which docs/DEPLOYMENT.md states and which nothing
# enforced: roles first, application second. PostgreSQL runs bootstrap.sh only
# against an empty data directory, so on every deployment after the first it
# never runs - and a migration that needs a role the cluster predates then fails
# at startup, with `quarkus.flyway.migrate-at-start=true`, which means the API
# does not start at all. Bringing the whole stack up and running bootstrap
# afterwards is too late: the API has already tried and died.
#
# So this brings PostgreSQL up alone, replays bootstrap.sh against it, and only
# then starts everything else.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=.env.prod
TAG=""

while [ $# -gt 0 ]; do
    case "$1" in
        --tag)      TAG="$2"; shift 2 ;;
        --env-file) ENV_FILE="$2"; shift 2 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

COMPOSE=(docker compose --env-file "$ENV_FILE"
         -f docker-compose.yml -f docker-compose.prod.yml)

if [ ! -f "$ENV_FILE" ]; then
    echo "$ENV_FILE is missing. Create it once:" >&2
    echo "    scripts/generate-env.sh <domain> --app balaaca --auth balaaca-auth" >&2
    exit 1
fi

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# --- 1. The code ------------------------------------------------------------
say "1/5  The checkout"
# --ff-only: a merge commit created here would be a divergence nobody is ever
# going to resolve on a Raspberry Pi over SSH.
git pull --ff-only

# --- 2. Which images ---------------------------------------------------------
# The last commit that could have changed an image, which is not the same as the
# last commit: most of them touch a compose file, a script or a document, and
# rebuilding three images for those would be work for nothing.
#
# This is the check that matters. A checkout ahead of its images is exactly the
# failure that cost a morning already: a jar rebuilt under a running process,
# serving classes from two builds at once, surfacing as a 500 with no
# compilation error anywhere near it. Here it would be subtler - new code,
# old containers - and nothing would say so.
IMAGE_COMMIT=$(git log -1 --format=%h -- backend frontend docker)
if [ -z "$TAG" ]; then
    TAG="$IMAGE_COMMIT"
fi
export BALAACA_IMAGE_TAG="$TAG"

say "2/5  The images: $TAG"
if [ "$TAG" != "$IMAGE_COMMIT" ] && [ "$TAG" != latest ]; then
    echo "     note: this checkout's images are $IMAGE_COMMIT, and you asked for $TAG"
fi

if ! "${COMPOSE[@]}" pull; then
    cat >&2 <<PULL
     The pull failed. The two usual reasons, in order of likelihood:

       * the packages are private and this machine is not logged in:
             docker login ghcr.io          (a token with read:packages)
       * no image is tagged $TAG. Images are built and pushed from a
         development machine - see docs/DEPLOYMENT.md - so a commit that
         changed backend/, frontend/ or docker/ needs its images pushed
         before it can be deployed.
PULL
    exit 1
fi

# --- 3. The roles, before anything asks for them -----------------------------
say "3/5  PostgreSQL, and its roles"
"${COMPOSE[@]}" up -d postgres

printf '     waiting '
for _ in $(seq 1 60); do
    state=$("${COMPOSE[@]}" ps --format '{{.Health}}' postgres 2>/dev/null | head -1)
    [ "$state" = healthy ] && break
    printf '.'; sleep 2
done
echo " ready"

# Idempotent by design: each role is created only if absent, and an existing
# role's password is never reapplied. Replaying it against an up-to-date cluster
# does nothing, which is why it runs every time rather than when someone
# remembers that a migration added a role.
"${COMPOSE[@]}" exec -T postgres bash /docker-entrypoint-initdb.d/10-bootstrap.sh

# --- 4. Everything else ------------------------------------------------------
say "4/5  The application"
"${COMPOSE[@]}" up -d

# --- 5. Say whether it worked ------------------------------------------------
say "5/5  Health"
failed=0
for _ in $(seq 1 90); do
    pending=$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' \
              | awk '$2 != "healthy" && $2 != "" { print $1 }' | tr '\n' ' ')
    [ -z "$pending" ] && break
    printf '.'; sleep 2
done
echo

# Reported per service and not as one verdict: "the stack is unhealthy" sends
# you to read six logs, and five of them are fine.
"${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | while read -r service health; do
    case "$health" in
        healthy|"") printf '     %-12s %s\n' "$service" "${health:-running}" ;;
        *)          printf '     %-12s %s   <- docker compose logs %s\n' \
                           "$service" "$health" "$service" ;;
    esac
done

if "${COMPOSE[@]}" ps --format '{{.Health}}' | grep -q unhealthy; then
    failed=1
fi

if [ "$failed" -eq 0 ]; then
    origin=$(grep -E '^APP_PUBLIC_ORIGIN=' "$ENV_FILE" | cut -d= -f2-)
    say "Up: $origin"
else
    echo
    echo "Something is unhealthy. The line above names which." >&2
    exit 1
fi
