-- Append-only. UPDATE and DELETE are revoked from the application role in V013.
CREATE TABLE audit_logs (
    id            bigserial PRIMARY KEY,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    actor_user_id uuid REFERENCES users(id),
    actor_role    varchar(20),
    actor_ip      inet,
    provider_id   uuid,                     -- NULL for a platform-wide action
    action        varchar(60) NOT NULL,
    entity_type   varchar(40) NOT NULL,
    entity_id     varchar(64),
    outcome       varchar(20) NOT NULL DEFAULT 'SUCCESS'
                  CHECK (outcome IN ('SUCCESS','DENIED','FAILURE')),
    -- Structured context. Never a secret, never more personal data than the
    -- action needs to be reconstructible.
    metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_audit_logs_provider ON audit_logs (provider_id, occurred_at DESC);
CREATE INDEX ix_audit_logs_actor    ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX ix_audit_logs_action   ON audit_logs (action, occurred_at DESC);
