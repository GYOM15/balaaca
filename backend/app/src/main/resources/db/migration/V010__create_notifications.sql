-- This table IS the transactional outbox. Rows are written in the same
-- transaction as the booking they describe, and a separate worker drains them.
-- No broker: the table already gives the transactional safety a broker would,
-- and one is deferred until volume justifies the operational cost.
CREATE TABLE notifications (
    id             uuid PRIMARY KEY,
    provider_id    uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    appointment_id uuid,
    recipient_kind varchar(20) NOT NULL CHECK (recipient_kind IN ('CUSTOMER','PROVIDER')),

    kind varchar(40) NOT NULL CHECK (kind IN (
             'BOOKING_CONFIRMATION','BOOKING_NOTICE','REMINDER','CANCELLATION','RESCHEDULE')),

    -- Idempotence. The target instant is part of the key rather than a version
    -- counter: it is deterministic, needs no extra column, and a reschedule
    -- naturally produces a different key.
    -- appointment:{uuid}:REMINDER:{scheduled_at epoch seconds}
    dedupe_key varchar(200) NOT NULL UNIQUE,

    -- Frozen at planning time: the customer may change their number afterwards,
    -- and the message must go where it was addressed.
    to_phone_e164 varchar(20),
    to_email      citext,
    locale        varchar(10) NOT NULL DEFAULT 'fr',
    payload       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- template variables, never a secret

    scheduled_at    timestamptz NOT NULL,
    status          varchar(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SENDING','SENT','FAILED','DEAD','CANCELLED')),
    attempts        int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts    int NOT NULL DEFAULT 6 CHECK (max_attempts > 0),
    retry_after_at  timestamptz NOT NULL DEFAULT now(),
    channel_used    varchar(20) CHECK (channel_used IN ('WHATSAPP','SMS','EMAIL')),
    last_error      varchar(500),
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_notifications_destination
        CHECK (to_phone_e164 IS NOT NULL OR to_email IS NOT NULL),
    FOREIGN KEY (provider_id, appointment_id) REFERENCES appointments (provider_id, id)
        ON DELETE CASCADE
);

-- The worker's claim query. Partial, so the index holds only what is due.
CREATE INDEX ix_notifications_due ON notifications (scheduled_at, retry_after_at)
    WHERE status = 'PENDING';
CREATE INDEX ix_notifications_appointment ON notifications (appointment_id)
    WHERE appointment_id IS NOT NULL;
