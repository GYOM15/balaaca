-- The tenant root.
CREATE TABLE providers (
    id            uuid PRIMARY KEY,
    slug          varchar(60) NOT NULL UNIQUE
                  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$'),
    business_name varchar(120) NOT NULL,
    category_id   uuid REFERENCES provider_categories(id),
    description   text,
    logo_url      text,
    cover_url     text,

    public_phone_e164   varchar(20),
    public_email        citext,
    whatsapp_phone_e164 varchar(20),

    country_code varchar(2)  NOT NULL DEFAULT 'GN',
    city         varchar(80),
    address_line varchar(200),
    latitude     numeric(9,6),
    longitude    numeric(9,6),
    -- Recurring opening hours are local time; this is what turns them into
    -- instants. Defaulted, never assumed: the product is not Guinea-only.
    timezone     varchar(64) NOT NULL DEFAULT 'Africa/Conakry',

    slot_granularity_minutes      int NOT NULL DEFAULT 15
                                  CHECK (slot_granularity_minutes BETWEEN 5 AND 120),
    min_lead_time_minutes         int NOT NULL DEFAULT 60 CHECK (min_lead_time_minutes >= 0),
    max_advance_days              int NOT NULL DEFAULT 60 CHECK (max_advance_days BETWEEN 1 AND 365),
    cancellation_deadline_minutes int NOT NULL DEFAULT 120 CHECK (cancellation_deadline_minutes >= 0),
    auto_confirm                  boolean NOT NULL DEFAULT true,

    status    varchar(20) NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
    -- Only a published provider is reachable by the public booking path.
    published boolean NOT NULL DEFAULT false,

    -- Sponsored placement is not built; these columns keep it additive later.
    is_featured    boolean NOT NULL DEFAULT false,
    featured_until timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_providers_featured_dated CHECK (NOT is_featured OR featured_until IS NOT NULL),
    CONSTRAINT ck_providers_public_phone
        CHECK (public_phone_e164 IS NULL OR public_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT ck_providers_whatsapp_phone
        CHECK (whatsapp_phone_e164 IS NULL OR whatsapp_phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE INDEX ix_providers_published ON providers (status, published) WHERE published;
CREATE INDEX ix_providers_category  ON providers (category_id) WHERE published;
CREATE INDEX ix_providers_city      ON providers (city) WHERE published;
CREATE INDEX ix_providers_name_trgm ON providers USING gin (business_name gin_trgm_ops);
