-- A business user linked to a Keycloak subject. No password, hash, reset token
-- or OTP is ever stored here: Keycloak owns all of that.
CREATE TABLE users (
    id               uuid PRIMARY KEY,
    keycloak_user_id varchar(64)  NOT NULL UNIQUE,
    display_name     varchar(120) NOT NULL,
    email            citext,
    phone_e164       varchar(20),
    locale           varchar(10)  NOT NULL DEFAULT 'fr',
    status           varchar(20)  NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT ck_users_phone_e164 CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX uq_users_phone ON users (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX ix_users_email ON users (email) WHERE email IS NOT NULL;

-- Global roles come from the verified JWT, never from a column here.
