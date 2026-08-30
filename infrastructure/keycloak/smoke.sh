#!/usr/bin/env bash
# Checks that the imported realm issues a token this API can actually use.
#
# It exists because a realm import can succeed and still be wrong in a way
# nothing else notices. Declaring "clientScopes" in a realm file REPLACES
# Keycloak's built-in set rather than adding to it, and the built-in "basic"
# scope is what carries the "sub" claim. Lose it and every token is valid,
# well-formed, correctly signed - and carries no subject, so the tenant
# resolution finds nobody and every authenticated call answers 403. That is
# exactly what happened the first time this realm was written, and only running
# it found out.
#
# Local only. It needs the compose stack up and uses the password grant through
# balaaca-dev-cli, which the production realm does not carry.
set -euo pipefail

KC="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${KEYCLOAK_REALM:-balaaca}"
CLIENT="${KEYCLOAK_DEV_CLIENT_ID:-balaaca-dev-cli}"
AUDIENCE="${KEYCLOAK_BACKEND_CLIENT_ID:-balaaca-backend}"
USERNAME="${1:-}"
PASSWORD="${2:-}"

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
    echo "usage: $0 <username> <password>" >&2
    echo "  Create the user first, in the admin console at $KC" >&2
    exit 2
fi

token=$(curl -sS -X POST "$KC/realms/$REALM/protocol/openid-connect/token" \
    -d "client_id=$CLIENT" \
    -d "username=$USERNAME" \
    -d "password=$PASSWORD" \
    -d "grant_type=password" \
    -d "scope=openid dashboard:read appointments:write catalog:write schedule:write profile:write staff:write" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')

if [ -z "$token" ]; then
    echo "no token: the realm refused the grant" >&2
    exit 1
fi

# The claims are read here rather than trusted: this is the whole point.
printf '%s' "$token" | python3 -c '
import base64, json, sys

payload = sys.stdin.read().split(".")[1]
payload += "=" * (-len(payload) % 4)
claims = json.loads(base64.urlsafe_b64decode(payload))

audience = claims.get("aud")
audience = audience if isinstance(audience, list) else [audience]
scopes = (claims.get("scope") or "").split()

problems = []
if not claims.get("sub"):
    problems.append("no sub claim: the built-in basic scope is missing from the realm")
if "'"$AUDIENCE"'" not in audience:
    problems.append("audience is %s, expected to contain '"$AUDIENCE"'" % audience)
for required in ("dashboard:read", "appointments:write",
                 "catalog:write", "schedule:write", "profile:write",
                 "staff:write"):
    if required not in scopes:
        problems.append("scope %s was requested and not granted" % required)

for line in problems:
    print("  " + line, file=sys.stderr)
sys.exit(1 if problems else 0)
'

echo "the realm issues a usable token"
