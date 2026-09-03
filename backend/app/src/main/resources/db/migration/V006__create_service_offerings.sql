CREATE TABLE service_offerings (
    id          uuid PRIMARY KEY,
    provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name        varchar(120) NOT NULL,
    description text,

    -- > 0, not >= 0: a zero-minute service yields an empty blocked range, and an
    -- empty range overlaps nothing, which silently disables the exclusion
    -- constraint that stops double booking.
    duration_minutes      int NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 720),
    buffer_before_minutes int NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 240),
    buffer_after_minutes  int NOT NULL DEFAULT 0 CHECK (buffer_after_minutes  BETWEEN 0 AND 240),

    price_amount_minor bigint     NOT NULL CHECK (price_amount_minor >= 0),
    price_currency     varchar(3) NOT NULL CHECK (price_currency ~ '^[A-Z]{3}$'),
    price_visible      boolean NOT NULL DEFAULT true,

    active     boolean NOT NULL DEFAULT true,
    sort_order int     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_service_offerings_provider_id UNIQUE (provider_id, id)
);
CREATE INDEX ix_service_offerings_provider ON service_offerings (provider_id, active, sort_order);
CREATE UNIQUE INDEX uq_service_offerings_name
    ON service_offerings (provider_id, lower(name)) WHERE active;
