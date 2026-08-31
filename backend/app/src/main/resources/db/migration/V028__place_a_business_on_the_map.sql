-- The directory's only geographic filter was providers.city, compared whole.
--
-- Every business in the capital writes "Conakry", so Kaloum and Sonfonia - two
-- ends of a forty-kilometre peninsula - are the same filter value, and the
-- filter answers either all of them or nothing. A customer in Matoto has no way
-- to exclude Kaloum.
--
-- ISO 3166-2:GN was the first thing checked, and it does not solve this. It
-- codes seven regions plus the Conakry governorate (GN-C), then thirty-three
-- prefectures, and stops: Conakry has NO ISO subdivision at all. Every provider
-- in the real market would land on GN-C, which is the present uselessness of
-- `city` with a better spelling. The code is kept as an interoperability
-- attribute on the levels that have one, never as the search key.
--
-- What this table holds is the part of the map that is CLOSED: eight regions,
-- thirty-three prefectures, and the ten communes of Conakry. It is complete on
-- the day it lands and it covers the whole country.
--
-- What it deliberately does not hold is the quartier. That is the finer grain a
-- customer in the capital actually thinks in, and it is genuinely an
-- administrative unit - but there are thousands of them, the platform does not
-- author them, and a partial list is one that fails exactly the provider whose
-- neighbourhood is missing. It lives on the provider instead, as folded text
-- whose values grow from registrations. See V030.

-- One table, adjacency list, because the hierarchy is NOT uniform and no fixed
-- ladder of columns fits it: upcountry a provider is placed at prefecture level,
-- in the capital at quartier level, and Conakry is a region whose children are
-- communes with no prefecture in between. That asymmetry is the real map.
CREATE TABLE localities (
    id           uuid PRIMARY KEY,
    parent_id    uuid REFERENCES localities(id),
    -- Three levels and no quartier. The quartier is not a list this platform
    -- can author - see V029 - and a kind nothing ever holds is a promise the
    -- schema makes and the data never keeps.
    kind         varchar(12) NOT NULL
                 CHECK (kind IN ('REGION','PREFECTURE','COMMUNE')),
    slug         varchar(80) NOT NULL UNIQUE
                 CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,78}[a-z0-9])$'),
    label_fr     varchar(80) NOT NULL,
    country_code varchar(2)  NOT NULL DEFAULT 'GN',

    -- Region and prefecture only: the standard publishes nothing below, which
    -- is precisely why this column cannot be the filter.
    iso_3166_2   varchar(6) UNIQUE
                 CHECK (iso_3166_2 IS NULL OR iso_3166_2 ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),

    -- What people actually type, already folded: lower case, no accents, one
    -- entry per accepted spelling. It carries the pre-2024 commune names and
    -- the "commune de x" forms, so a provider typing what is on their sign
    -- still lands on the canonical row.
    aliases      text[] NOT NULL DEFAULT '{}',

    sort_order   int     NOT NULL DEFAULT 0,
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    -- A region is a root and a root is a region. Nothing stricter: Conakry's
    -- children are communes while Kindia's are prefectures, and a ladder CHECK
    -- would forbid the actual map.
    CONSTRAINT ck_localities_root
        CHECK ((kind = 'REGION') = (parent_id IS NULL)),
    CONSTRAINT ck_localities_iso_level
        CHECK (iso_3166_2 IS NULL OR kind IN ('REGION','PREFECTURE')),
    CONSTRAINT ck_localities_not_self_parent
        CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX ix_localities_parent  ON localities (parent_id) WHERE active;
-- Resolving what somebody typed: slug = :folded OR :folded = ANY (aliases).
CREATE INDEX ix_localities_aliases ON localities USING gin (aliases) WHERE active;
-- So `q` reaches a place name the way V022 made it reach a service name.
CREATE INDEX ix_localities_label_trgm
    ON localities USING gin (label_fr gin_trgm_ops) WHERE active;

-- No row-level security, on purpose and for the reason V022 recorded: this is
-- public reference data, identical for every tenant, and the directory reads it
-- with NO tenant bound. A FORCE RLS table would return zero rows there and the
-- filter would silently answer nothing. provider_categories is granted the same
-- way.
GRANT SELECT ON localities TO balaaca_app;

-- ---------------------------------------------------------------------------
-- Attaching a business
-- ---------------------------------------------------------------------------
-- Nullable, like category_id: a locality nobody seeded must not block a
-- registration, and name search still reaches that provider through the trigram
-- index.
--
-- It points at the FINEST level known - a commune in Conakry, a prefecture
-- upcountry - and the filter matches the SUBTREE, so a business filed under
-- Ratoma is returned by a search on Ratoma and by one on Conakry alike. One
-- column serves both geographies.
ALTER TABLE providers ADD COLUMN locality_id uuid REFERENCES localities(id);
CREATE INDEX ix_providers_locality ON providers (locality_id);

COMMENT ON COLUMN providers.city IS
    'Superseded by locality_id. Kept because it is what every existing row has '
    'and what a provider typed; the directory reads locality_id and falls back '
    'to this. Dropping it would lose the only geography those rows carry.';
