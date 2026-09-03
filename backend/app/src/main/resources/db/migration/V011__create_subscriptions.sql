-- Which plan a provider is on. The plan LIMITS are code (PlanCatalog), not rows:
-- they are product rules, versioned with the code and testable.
CREATE TABLE subscriptions (
    id           uuid PRIMARY KEY,
    provider_id  uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    plan         varchar(20) NOT NULL CHECK (plan IN ('FREE','PRO','BUSINESS')),
    status       varchar(20) NOT NULL
                 CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','EXPIRED','CANCELLED')),
    price_amount_minor bigint     NOT NULL DEFAULT 0 CHECK (price_amount_minor >= 0),
    price_currency     varchar(3) NOT NULL DEFAULT 'GNF' CHECK (price_currency ~ '^[A-Z]{3}$'),
    started_at   timestamptz NOT NULL,
    expires_at   timestamptz,
    cancelled_at timestamptz,
    notes        varchar(300),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_subscriptions_period CHECK (expires_at IS NULL OR expires_at > started_at)
);
-- One live subscription per provider; the history stays.
CREATE UNIQUE INDEX uq_subscriptions_live ON subscriptions (provider_id)
    WHERE status IN ('TRIAL','ACTIVE','PAST_DUE');
CREATE INDEX ix_subscriptions_expiry ON subscriptions (expires_at)
    WHERE status IN ('TRIAL','ACTIVE');
