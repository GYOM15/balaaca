#!/usr/bin/env bash
# Fills a development database with something to look at.
#
# Six businesses across five trades and five places, their people, their
# catalogue with all three fulfilments, their opening hours, and a fortnight of
# appointments around today. Enough that every screen has content: the hub, a
# trade, a place, a provider page, the booking flow, a diary, a drop-off queue,
# a customer's history.
#
# Idempotent: every row it writes carries a well-known id beginning 5eed, and it
# deletes those before writing them again. It never touches a row the product
# created - your own account, and the business you attach to it, are untouched.
#
# It creates no Keycloak user. Nobody can sign in as one of these salons: a
# seeded password would be a credential in a repository, and signing in is what
# you do with your own account.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
    echo "Il manque .env. Copiez-le : cp .env.example .env" >&2
    exit 1
fi
# shellcheck source=/dev/null
set -a; . ./.env; set +a

CONTAINER="${COMPOSE_PROJECT_NAME:-balaaca}-postgres-1"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "PostgreSQL ne tourne pas. Lancez scripts/dev.sh d'abord." >&2
    exit 1
fi

# A guard, not a formality. This script deletes and rewrites rows by id, and the
# ids are fixed - so running it against anything but a local development
# database would overwrite real data with fixtures. The check is the database
# name, because that is the only thing a mistyped host cannot fake.
if [ "${POSTGRES_DB:-balaaca}" != "balaaca" ]; then
    echo "POSTGRES_DB vaut ${POSTGRES_DB}. Ce script n'ecrit que dans 'balaaca'." >&2
    exit 1
fi

run() {
    echo "  $1"
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q \
        -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-balaaca}" < "scripts/seed/$1"
}

echo "Remplissage de la base de developpement"
run dev-data.sql
run dev-bookings.sql

docker exec -i "$CONTAINER" psql -tA -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-balaaca}" <<'SQL'
SELECT '  ' || count(*) || ' etablissements, '
       || (SELECT count(*) FROM provider_staff WHERE provider_id::text LIKE '5eed%') || ' personnes, '
       || (SELECT count(*) FROM service_offerings WHERE provider_id::text LIKE '5eed%') || ' prestations, '
       || (SELECT count(*) FROM appointments WHERE id::text LIKE '5eed%') || ' rendez-vous, '
       || (SELECT count(*) FROM customers WHERE id::text LIKE '5eed%') || ' clients'
FROM providers WHERE id::text LIKE '5eed%';
SQL

echo
echo "  Le site     http://localhost:3000"
echo "  Une page    http://localhost:3000/p/salon-fatou"
echo "  Un depot    http://localhost:3000/p/atelier-mariama"
echo "  A domicile  http://localhost:3000/p/sylla-plomberie"
