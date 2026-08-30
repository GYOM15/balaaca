#!/bin/sh
# Fills the realm template from the environment, starts Keycloak, and finishes
# the configuration the import cannot do.
#
# Adapted from the same pattern used in ecclesiaflow, which had already paid for
# the three lessons below.
#
# Mounted as the container entrypoint. Keycloak's own arguments arrive as CMD
# and are forwarded with "$@".
set -eu

TEMPLATE="/opt/keycloak/data/template/realm-balaaca.json.template"
OUTPUT="/opt/keycloak/data/import/realm-balaaca.json"
REALM="balaaca"
KCADM="/opt/keycloak/bin/kcadm.sh"

# The container healthcheck waits on this. Keycloak's own /health/ready goes
# green as soon as the server boots, but the client scopes below are assigned
# seconds later - long enough for the API to start, mint a token with no scopes,
# and cache it for a full token lifespan. Cleared up front so a restart waits
# for this boot's configuration rather than the last one's.
SENTINEL="/tmp/keycloak-postconfig-done"
rm -f "$SENTINEL"

# --- The template ------------------------------------------------------------

[ -f "$TEMPLATE" ] || { echo "[init-realm] template not found: $TEMPLATE" >&2; exit 1; }

MISSING=""
[ -z "${KEYCLOAK_FRONTEND_CLIENT_SECRET:-}" ] && MISSING="$MISSING KEYCLOAK_FRONTEND_CLIENT_SECRET"
if [ -n "$MISSING" ]; then
    echo "[init-realm] missing required environment:$MISSING" >&2
    exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
sed \
  -e "s|__KEYCLOAK_FRONTEND_CLIENT_SECRET__|${KEYCLOAK_FRONTEND_CLIENT_SECRET}|g" \
  -e "s|__FRONTEND_REDIRECT_URI__|${FRONTEND_REDIRECT_URI:-http://localhost:3000/*}|g" \
  -e "s|__FRONTEND_ORIGIN__|${FRONTEND_ORIGIN:-http://localhost:3000}|g" \
  "$TEMPLATE" > "$OUTPUT"

# A placeholder that survived means a variable nobody noticed was missing, and
# the realm would import with the literal marker as a secret.
if grep -q '__[A-Z0-9_]*__' "$OUTPUT"; then
    echo "[init-realm] unresolved placeholders:" >&2
    grep -o '__[A-Z0-9_]*__' "$OUTPUT" | sort -u >&2
    exit 1
fi
echo "[init-realm] realm file generated"

# --- Keycloak ----------------------------------------------------------------

/opt/keycloak/bin/kc.sh "$@" &
KC_PID=$!
trap 'kill $KC_PID; wait $KC_PID; exit' INT TERM

echo "[init-realm] waiting for Keycloak..."
ATTEMPTS=0
until sh -c 'exec 3<>/dev/tcp/127.0.0.1/8080' 2>/dev/null; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ "$ATTEMPTS" -ge 90 ]; then
        echo "[init-realm] not ready after 180s - skipping post-config" >&2
        wait $KC_PID
        exit $?
    fi
    sleep 2
done
sleep 3

# From here nothing may abort the container: Keycloak is up and serving, and a
# failed post-config step is a degraded realm, not a dead one. It must be loud,
# and the sentinel must stay absent so the healthcheck reports it.
set +e

if ! $KCADM config credentials --server http://localhost:8080 --realm master \
        --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; then
    echo "[init-realm] could not authenticate kcadm - post-config skipped" >&2
    wait $KC_PID
    exit $?
fi

# Docker Desktop maps host requests through the bridge gateway rather than
# 127.0.0.1, which the master realm's default sslRequired=external then refuses
# over HTTP. Dev only.
case "$*" in
    *start-dev*)
        $KCADM update realms/master -s sslRequired=NONE >/dev/null 2>&1 \
            && echo "[init-realm] master sslRequired=NONE (dev)"
        ;;
esac

# --- What the import cannot do ----------------------------------------------
#
# Declaring clientScopes in a realm file REPLACES Keycloak's built-in set rather
# than adding to it, and the built-in "basic" scope is what carries the "sub"
# claim. A realm written that way issues tokens that are valid, signed and
# correctly scoped - and carry no subject, so tenant resolution finds nobody and
# every authenticated call answers 403. Creating them here leaves the built-ins
# untouched, and leaves no copy of them in this repository to go stale.
#
# --import-realm also does not update an EXISTING client, so everything below is
# written to be idempotent and to run on every boot.

create_scope() {
    if $KCADM get client-scopes -r "$REALM" --fields name 2>/dev/null | grep -q "\"$1\""; then
        echo "[init-realm]   scope $1 exists"
        return
    fi
    $KCADM create client-scopes -r "$REALM" \
        -s "name=$1" -s "description=$2" -s protocol=openid-connect \
        -s 'attributes."include.in.token.scope"=true' \
        -s 'attributes."display.on.consent.screen"=false' >/dev/null 2>&1 \
        && echo "[init-realm]   scope $1 created" \
        || echo "[init-realm]   WARNING: could not create scope $1" >&2
}

client_id_of() {
    $KCADM get clients -r "$REALM" -q "clientId=$1" --fields id 2>/dev/null \
        | grep '"id"' | head -1 | sed 's/.*: "//;s/".*//'
}

scope_id_of() {
    $KCADM get client-scopes -r "$REALM" 2>/dev/null \
        | grep -B4 "\"name\" : \"$1\"" | grep '"id"' | head -1 | sed 's/.*: "//;s/".*//'
}

assign_scope() {
    _cid=$(client_id_of "$1")
    _sid=$(scope_id_of "$2")
    if [ -z "$_cid" ] || [ -z "$_sid" ]; then
        echo "[init-realm]   WARNING: cannot assign $2 to $1" >&2
        return
    fi
    $KCADM update "clients/$_cid/default-client-scopes/$_sid" -r "$REALM" >/dev/null 2>&1 \
        && echo "[init-realm]   $2 -> $1"
}

echo "[init-realm] client scopes..."
create_scope "balaaca-audience" "Puts balaaca-backend in the token's audience."
create_scope "dashboard:read" "Read the caller's own agenda and settings."
create_scope "appointments:write" "Create and move the caller's own appointments."

# The audience mapper cannot be declared with the scope above: kcadm creates a
# scope and its mappers in two calls.
AUDIENCE_SID=$(scope_id_of "balaaca-audience")
if [ -n "$AUDIENCE_SID" ] && ! $KCADM get "client-scopes/$AUDIENCE_SID/protocol-mappers/models" \
        -r "$REALM" 2>/dev/null | grep -q "balaaca-backend-audience"; then
    $KCADM create "client-scopes/$AUDIENCE_SID/protocol-mappers/models" -r "$REALM" \
        -s name=balaaca-backend-audience \
        -s protocol=openid-connect \
        -s protocolMapper=oidc-audience-mapper \
        -s 'config."included.client.audience"=balaaca-backend' \
        -s 'config."access.token.claim"=true' \
        -s 'config."id.token.claim"=false' >/dev/null 2>&1 \
        && echo "[init-realm]   audience mapper created"
fi

# A token that names no API is a token any API would have to guess about, so
# both token-issuing clients carry the audience. The scopes are default rather
# than optional: this product has no consent screen to grant them on.
for client in balaaca-frontend balaaca-dev-cli; do
    for scope in balaaca-audience dashboard:read appointments:write; do
        assign_scope "$client" "$scope"
    done
done

# The secret lives in the environment, and --import-realm ignores it on a realm
# that already exists. Re-applied every boot so rotating it is a restart.
FRONTEND_CID=$(client_id_of "balaaca-frontend")
if [ -n "$FRONTEND_CID" ]; then
    $KCADM update "clients/$FRONTEND_CID" -r "$REALM" \
        -s publicClient=false \
        -s clientAuthenticatorType=client-secret \
        -s "secret=$KEYCLOAK_FRONTEND_CLIENT_SECRET" >/dev/null 2>&1 \
        && echo "[init-realm]   balaaca-frontend secret applied"
fi

touch "$SENTINEL"
echo "[init-realm] realm configured"

wait $KC_PID
