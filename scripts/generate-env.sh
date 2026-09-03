#!/usr/bin/env bash
# Writes .env.prod: every secret generated, every public address derived from
# one domain.
#
#   scripts/generate-env.sh ecclify.com
#   scripts/generate-env.sh ecclify.com --app beta --auth auth
#
# It exists because the alternative is a person pasting eight secrets by hand
# into a file that nothing validates, on a machine they are logged into over
# SSH at the end of an evening. Two of those eight are database passwords that
# bootstrap.sh applies ONCE, at the moment the data directory is created; get
# one wrong and the failure arrives later, as an application that cannot log in
# to a database that is perfectly healthy.
#
# Hex and not base64. These land unquoted in a .env file, inside a JSON realm
# template, and in a JDBC URL - and base64's + / = are special in at least one
# of those three. The session key is HKDF-derived anyway, so its encoding is
# nobody's business but this line's.
set -euo pipefail

cd "$(dirname "$0")/.."

APP_LABEL=beta
AUTH_LABEL=auth
DOMAIN=""

while [ $# -gt 0 ]; do
    case "$1" in
        --app)  APP_LABEL="$2";  shift 2 ;;
        --auth) AUTH_LABEL="$2"; shift 2 ;;
        -*)     echo "unknown option: $1" >&2; exit 2 ;;
        *)      DOMAIN="$1";     shift ;;
    esac
done

if [ -z "$DOMAIN" ]; then
    cat >&2 <<USAGE
usage: scripts/generate-env.sh <domain> [--app <label>] [--auth <label>]

  scripts/generate-env.sh ecclify.com
      -> https://beta.ecclify.com   and   https://auth.ecclify.com
USAGE
    exit 2
fi

OUT=.env.prod

# Refusing rather than backing up. Regenerating over a deployment that already
# has a database is not recoverable by keeping a copy: bootstrap.sh never
# reapplies an existing role's password, so the new file would name credentials
# the cluster does not have, and every service would fail to connect at once.
# Rotating a secret on purpose is a deliberate act, and it starts with moving
# this file yourself.
if [ -e "$OUT" ]; then
    echo "$OUT already exists. Refusing to overwrite it." >&2
    echo "Its database passwords are the ones the cluster was built with;" >&2
    echo "a new file would name credentials PostgreSQL has never heard of." >&2
    exit 1
fi

if [ ! -f .env.example ]; then
    echo ".env.example is missing - run this from a checkout." >&2
    exit 1
fi

secret() { openssl rand -hex 32; }

APP_ORIGIN="https://${APP_LABEL}.${DOMAIN}"
AUTH_ORIGIN="https://${AUTH_LABEL}.${DOMAIN}"

# The example is the template, so a variable added there arrives here without
# anyone remembering to add it twice. Only two things are rewritten: the
# placeholder every secret shares, and the addresses a browser has to resolve.
umask 077
{
    while IFS= read -r line; do
        case "$line" in
            *=change-me-locally)  printf '%s=%s\n' "${line%%=*}" "$(secret)" ;;
            KEYCLOAK_PUBLIC_URL=*) printf 'KEYCLOAK_PUBLIC_URL=%s\n' "$AUTH_ORIGIN" ;;
            KEYCLOAK_ISSUER_URL=*) printf 'KEYCLOAK_ISSUER_URL=%s/realms/balaaca\n' "$AUTH_ORIGIN" ;;
            APP_PUBLIC_ORIGIN=*)   printf 'APP_PUBLIC_ORIGIN=%s\n' "$APP_ORIGIN" ;;
            # Inside the compose network, by service name. The browser never
            # addresses the API, so this must NOT become a public address.
            BALAACA_API_BASE_URL=*) printf 'BALAACA_API_BASE_URL=http://api:8080\n' ;;
            *) printf '%s\n' "$line" ;;
        esac
    done < .env.example

    # Not in .env.example because compose defaults them for a developer. In a
    # deployment they are the redirect Keycloak will accept and the origin it
    # will allow: wrong, and sign-in fails at the redirect with a message that
    # names neither of them.
    printf '\n# Written by scripts/generate-env.sh\n'
    printf 'FRONTEND_ORIGIN=%s\n' "$APP_ORIGIN"
    printf 'FRONTEND_REDIRECT_URI=%s/*\n' "$APP_ORIGIN"
} > "$OUT"

chmod 600 "$OUT"

cat <<DONE
Wrote $OUT (mode 600), with:

  the site        $APP_ORIGIN
  sign-in         $AUTH_ORIGIN

Every secret in it was generated just now. Back this file up somewhere that is
not this machine, BEFORE you start the stack: after that, its database
passwords are the only copy of credentials the cluster will accept.

Then:

  docker compose --env-file $OUT -f docker-compose.yml -f docker-compose.prod.yml pull
  docker compose --env-file $OUT -f docker-compose.yml -f docker-compose.prod.yml up -d
DONE
