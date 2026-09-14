#!/usr/bin/env bash
# Gives somebody the platform's back office, or takes it away.
#
#   scripts/grant-operator.sh                       # BALAACA_PLATFORM_ADMIN_EMAIL
#   scripts/grant-operator.sh somebody@example.com
#   scripts/grant-operator.sh --revoke somebody@example.com
#   scripts/grant-operator.sh --list
#
# With no address it reads BALAACA_PLATFORM_ADMIN_EMAIL from the env file,
# which generate-env.sh asked for once when the machine was set up. That is
# what makes a wipe cheap: `docker compose down -v` removes the volumes and not
# this file, so after signing up again the whole ceremony is one word.
#
# It exists because this was four commands copied out of a chat window, two of
# which fail in ways that look like something else:
#
#   * a bare `docker compose` reads .env, absent on a deployment, so every
#     variable resolves to empty - and it still finds the container by name, so
#     it half works and fails somewhere unrelated
#   * the credentials line has to be expanded by the CONTAINER's shell, not this
#     one, or Keycloak is handed an empty user and an empty password
#   * `config credentials` is a separate first step, and skipping it answers
#     "Session has expired", which reads like a session lapsed rather than one
#     that never existed
#   * `add-roles` succeeds in SILENCE, so nobody checks
#
# The account must already exist. A support person signs up like anybody else
# and simply creates no business; this promotes them afterwards. Nobody here
# types anybody else's password.
set -euo pipefail

cd "$(dirname "$0")/.."

REALM=balaaca
ROLE=platform-admin
ENV_FILE=.env.prod
ACTION=grant
WHO=""

while [ $# -gt 0 ]; do
    case "$1" in
        --revoke)   ACTION=revoke; shift ;;
        --list)     ACTION=list; shift ;;
        --env-file) ENV_FILE="$2"; shift 2 ;;
        -*) echo "unknown option: $1" >&2; exit 2 ;;
        *)  WHO="$1"; shift ;;
    esac
done

if [ ! -f "$ENV_FILE" ]; then
    echo "$ENV_FILE is missing. This runs on the deployment, not on a laptop." >&2
    exit 1
fi

# Read for one variable, and only when no address was given. The file holds
# every password the stack has: sourcing it to answer a question nobody asked
# would put all of them in this process's environment for the sake of one.
if [ "$ACTION" != list ] && [ -z "$WHO" ]; then
    WHO=$(sed -n 's/^BALAACA_PLATFORM_ADMIN_EMAIL=//p' "$ENV_FILE" | head -1)
    if [ -z "$WHO" ]; then
        echo "No address given, and BALAACA_PLATFORM_ADMIN_EMAIL is empty in $ENV_FILE." >&2
        echo "Either pass one, or fill that variable in so a wipe costs nothing:" >&2
        echo "    scripts/grant-operator.sh somebody@example.com" >&2
        exit 2
    fi
    echo "Using $WHO, from $ENV_FILE."
fi

COMPOSE=(docker compose --env-file "$ENV_FILE"
         -f docker-compose.yml -f docker-compose.prod.yml)
KCADM=/opt/keycloak/bin/kcadm.sh

# Single quotes, and they are load bearing: the two names are expanded INSIDE
# the container, which compose has already given them to. Expanded here they
# would be empty, and Keycloak would be handed an empty user.
"${COMPOSE[@]}" exec -T keycloak sh -c "$KCADM config credentials \
    --server http://localhost:8080 --realm master \
    --user \"\$KEYCLOAK_ADMIN\" --password \"\$KEYCLOAK_ADMIN_PASSWORD\"" >/dev/null

# The role comes from init-realm.sh, which is this container's entrypoint and a
# bind mount - so a checkout that has it and a container that never restarted
# since is the ordinary way for this to be missing. Said here rather than left
# to kcadm's "Role not found for name", which names the symptom.
if ! "${COMPOSE[@]}" exec -T keycloak "$KCADM" get "roles/$ROLE" -r "$REALM" >/dev/null 2>&1; then
    echo "The realm has no role $ROLE." >&2
    echo "It is created by infrastructure/keycloak/init-realm.sh, which runs when" >&2
    echo "the container starts. Pull, then restart it:" >&2
    echo "    ${COMPOSE[*]} restart keycloak" >&2
    exit 1
fi

case "$ACTION" in
    list)
        echo "Operators in realm $REALM:"
        # Asked of the role rather than of each user, because the question is
        # who holds it and a per-user sweep would be a different question with
        # a slower answer.
        "${COMPOSE[@]}" exec -T keycloak "$KCADM" get "roles/$ROLE/users" \
            -r "$REALM" --fields username,email 2>/dev/null \
            | grep '"username"' | sed 's/.*: "/    /;s/".*//' || echo "    nobody"
        ;;
    grant|revoke)
        verb=add-roles
        [ "$ACTION" = revoke ] && verb=remove-roles
        "${COMPOSE[@]}" exec -T keycloak "$KCADM" "$verb" \
            -r "$REALM" --uusername "$WHO" --rolename "$ROLE"

        # Read back, because both verbs succeed in silence and a typo in an
        # address is refused loudly while a grant that did nothing is not.
        held=$("${COMPOSE[@]}" exec -T keycloak "$KCADM" get-roles \
               -r "$REALM" --uusername "$WHO" --fields name 2>/dev/null \
               | grep -c "\"$ROLE\"" || true)

        if [ "$ACTION" = grant ] && [ "$held" -eq 0 ]; then
            echo "$WHO still does not hold $ROLE." >&2
            exit 1
        fi
        if [ "$ACTION" = revoke ] && [ "$held" -ne 0 ]; then
            echo "$WHO still holds $ROLE." >&2
            exit 1
        fi

        echo
        [ "$ACTION" = grant ] && echo "    $WHO now operates the back office."
        [ "$ACTION" = revoke ] && echo "    $WHO no longer operates the back office."
        # A token already issued does not carry a role granted after it, and
        # does not lose one revoked after it either. Said out loud, because the
        # first thing anybody does is reload the page and conclude it failed.
        echo "    They must sign out and back in: a token already issued does not change."
        ;;
esac
