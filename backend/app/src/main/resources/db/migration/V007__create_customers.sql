-- A provider's own address book. Distinct from users: most customers book
-- without ever creating an account, which is the point.
CREATE TABLE customers (
    id          uuid PRIMARY KEY,
    provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    user_id     uuid REFERENCES users(id),
    full_name   varchar(120) NOT NULL,
    phone_e164  varchar(20)  NOT NULL,   -- the primary identifier
    email       citext,                  -- optional: friction the product does not need
    notes       text,                    -- private to the provider
    blocked     boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_customers_phone_e164 CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT uq_customers_provider_id UNIQUE (provider_id, id)
);
-- One customer per number per provider: the upsert key at booking time.
CREATE UNIQUE INDEX uq_customers_phone ON customers (provider_id, phone_e164);
CREATE INDEX ix_customers_user ON customers (user_id) WHERE user_id IS NOT NULL;
