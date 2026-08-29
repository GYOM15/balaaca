CREATE TABLE provider_staff (
    id           uuid PRIMARY KEY,
    provider_id  uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    user_id      uuid REFERENCES users(id),          -- NULL: a bookable resource with no account
    display_name varchar(120) NOT NULL,
    role         varchar(20) NOT NULL DEFAULT 'STAFF' CHECK (role IN ('OWNER','STAFF')),
    bookable     boolean NOT NULL DEFAULT true,
    status       varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    -- Required by every composite foreign key pointing here. Declared in the
    -- creating migration: added later, the first referencing migration fails
    -- with 42830 on a fresh database.
    CONSTRAINT uq_provider_staff_provider_id UNIQUE (provider_id, id)
);
CREATE INDEX ix_provider_staff_provider ON provider_staff (provider_id);

-- One active membership per account, enforced rather than assumed: the resolver
-- returns a single provider, and a silent second row would make which tenant a
-- user lands in depend on row order. A person cannot yet be staff at two
-- providers; that limitation is deliberate and recorded in ADR-0002.
CREATE UNIQUE INDEX uq_provider_staff_one_active_membership
    ON provider_staff (user_id) WHERE user_id IS NOT NULL AND status = 'ACTIVE';
