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

# $3 is "default" or "optional".
#
# A DEFAULT scope lands in every token the client issues, for every user,
# unconditionally. Every API scope was default, which meant every caller held
# every one of them and no @RolesAllowed anywhere could refuse anybody.
#
# They are OPTIONAL now: a client asks for what it needs and the token carries
# that and no more. This is not the privilege boundary - a caller may still ask
# for everything, and what a member may do inside their own provider is settled
# by provider_staff.role in the database, on every request. It is the difference
# between a token that says what it is for and one that says everything.
#
# balaaca-audience stays default: a token that names no API is a token every API
# has to guess about.
assign_scope() {
    _cid=$(client_id_of "$1")
    _sid=$(scope_id_of "$2")
    _kind="${3:-optional}"
    if [ -z "$_cid" ] || [ -z "$_sid" ]; then
        echo "[init-realm]   WARNING: cannot assign $2 to $1" >&2
        return
    fi
    # Moving a scope between the two lists means removing it from the other, or
    # Keycloak keeps both and default wins.
    _other="default"
    [ "$_kind" = "default" ] && _other="optional"
    $KCADM delete "clients/$_cid/${_other}-client-scopes/$_sid" -r "$REALM" >/dev/null 2>&1 || true
    $KCADM update "clients/$_cid/${_kind}-client-scopes/$_sid" -r "$REALM" >/dev/null 2>&1 \
        && echo "[init-realm]   $2 -> $1 ($_kind)"
}

echo "[init-realm] client scopes..."
create_scope "balaaca-audience" "Puts balaaca-backend in the token's audience."
create_scope "dashboard:read" "Read the caller's own agenda and settings."
create_scope "appointments:write" "Create and move the caller's own appointments."
create_scope "catalog:write" "Create and change the caller's own services."
create_scope "schedule:write" "Set the caller's own opening hours and closures."
create_scope "profile:write" "Change the caller's own public page, and publish it."
create_scope "staff:write" "Add and change the caller's own people."

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
# both token-issuing clients carry the audience, and it is the only default.
for client in balaaca-frontend balaaca-dev-cli; do
    assign_scope "$client" "balaaca-audience" default
    for scope in dashboard:read appointments:write catalog:write \
                 schedule:write profile:write staff:write; do
        assign_scope "$client" "$scope" optional
    done
done

# The secret lives in the environment, and --import-realm ignores it on a realm
# that already exists. Re-applied every boot so rotating it is a restart.
#
# This was the one step in the file with no failure branch: it echoed on success
# and said nothing otherwise, with stdout and stderr discarded, and the sentinel
# was touched unconditionally two lines below. So a rotation that failed - an
# expired kcadm session, a client list not yet consistent, client_id_of coming
# back empty - printed nothing, went green on the healthcheck, and left Keycloak
# accepting the OLD secret while the operator believed the leak was closed. The
# header of this file promises the opposite, in those words.
FRONTEND_CID=$(client_id_of "balaaca-frontend")
if [ -z "$FRONTEND_CID" ]; then
    echo "[init-realm] FATAL: client balaaca-frontend not found; secret not applied" >&2
    exit 1
fi
if ! $KCADM update "clients/$FRONTEND_CID" -r "$REALM" \
        -s publicClient=false \
        -s clientAuthenticatorType=client-secret \
        -s "secret=$KEYCLOAK_FRONTEND_CLIENT_SECRET" >/dev/null 2>&1; then
    echo "[init-realm] FATAL: could not apply the balaaca-frontend secret." >&2
    echo "[init-realm]        Keycloak still accepts the previous one." >&2
    exit 1
fi
echo "[init-realm]   balaaca-frontend secret applied"

# Only now. The sentinel is what the compose healthcheck waits on, so touching
# it after a failed step is the same as reporting a realm that works.
touch "$SENTINEL"
echo "[init-realm] realm configured"

wait $KC_PID
