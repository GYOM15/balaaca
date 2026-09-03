-- The product's single most critical table. Every constraint below was executed
-- against PostgreSQL 18.6 before being written here; see ADR-0003.
CREATE TABLE appointments (
    id                  uuid PRIMARY KEY,
    provider_id         uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    -- NOT NULL, never coalesce(staff_id, provider_id): an unassigned booking
    -- would then only conflict with other unassigned ones and would miss a
    -- clash with a named appointment. "Any staff" is resolved to a concrete
    -- person server-side, before the insert.
    staff_id            uuid NOT NULL,
    service_offering_id uuid NOT NULL,
    customer_id         uuid NOT NULL,
    booked_by_user_id   uuid REFERENCES users(id),

    starts_at timestamptz NOT NULL,
    ends_at   timestamptz NOT NULL,

    -- Frozen at booking: changing the offering later never moves what an
    -- existing appointment blocks.
    buffer_before_minutes int NOT NULL CHECK (buffer_before_minutes >= 0),
    buffer_after_minutes  int NOT NULL CHECK (buffer_after_minutes  >= 0),
    blocked_from  timestamptz NOT NULL,
    blocked_until timestamptz NOT NULL,

    status varchar(20) NOT NULL DEFAULT 'PENDING'
           CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
    cancellation_reason varchar(200),
    cancelled_by        varchar(20) CHECK (cancelled_by IN ('CUSTOMER','PROVIDER','SYSTEM')),
    cancelled_at        timestamptz,

    -- What the customer owes, frozen. Named for its meaning so that a platform
    -- fee or a payout can be added later without making historical rows
    -- ambiguous about which number they held.
    service_name                varchar(120) NOT NULL,
    customer_price_amount_minor bigint       NOT NULL CHECK (customer_price_amount_minor >= 0),
    customer_price_currency     varchar(3)   NOT NULL CHECK (customer_price_currency ~ '^[A-Z]{3}$'),
    duration_minutes            int          NOT NULL CHECK (duration_minutes > 0),

    customer_note varchar(500),
    provider_note text,                     -- private, never returned to a customer
    source varchar(20) NOT NULL DEFAULT 'PUBLIC'
           CHECK (source IN ('PUBLIC','DASHBOARD','CHATBOT','ADMIN')),

    idempotency_key          varchar(80),
    idempotency_request_hash varchar(64),

    version    bigint      NOT NULL DEFAULT 0,   -- optimistic lock
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Generated, because tstzrange IS immutable. The buffers cannot be folded in
    -- here: timestamptz +/- interval is only STABLE, and a generated column
    -- rejects it with 42P17.
    blocked_range tstzrange GENERATED ALWAYS AS
        (tstzrange(blocked_from, blocked_until, '[)')) STORED,

    CONSTRAINT ck_appointments_window         CHECK (ends_at > starts_at),
    -- An empty range overlaps NOTHING, so without this the exclusion constraint
    -- below is silently inert and unlimited bookings land on one instant.
    CONSTRAINT ck_appointments_block_nonempty CHECK (blocked_until > blocked_from),
    CONSTRAINT ck_appointments_block_covers   CHECK (blocked_from  <= starts_at
                                                 AND blocked_until >= ends_at),
    -- Without this the blocked range is merely DECLARED: a caller could claim a
    -- one-minute window for an hour-long service and leave 59 minutes open. A
    -- CHECK may use make_interval even though a generated column may not.
    CONSTRAINT ck_appointments_block_derived  CHECK (
        blocked_from  = starts_at - make_interval(mins => buffer_before_minutes)
    AND blocked_until = ends_at   + make_interval(mins => buffer_after_minutes)),
    CONSTRAINT ck_appointments_cancel_shape CHECK (
        status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)),
    CONSTRAINT ck_appointments_idempotency_pair CHECK (
        (idempotency_key IS NULL) = (idempotency_request_hash IS NULL)),

    -- Composite: a booking cannot reference another tenant's service, staff or
    -- customer. The database refuses it, whatever the application does.
    FOREIGN KEY (provider_id, staff_id)            REFERENCES provider_staff    (provider_id, id),
    FOREIGN KEY (provider_id, service_offering_id) REFERENCES service_offerings (provider_id, id),
    FOREIGN KEY (provider_id, customer_id)         REFERENCES customers         (provider_id, id),

    CONSTRAINT uq_appointments_provider_id UNIQUE (provider_id, id)
);

-- The guarantee. It holds for every code path and every number of instances,
-- at READ COMMITTED, with no lock discipline to forget.
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
    EXCLUDE USING gist (provider_id WITH =, staff_id WITH =, blocked_range WITH &&)
    WHERE (status IN ('PENDING','CONFIRMED'));

CREATE UNIQUE INDEX uq_appointments_idempotency
    ON appointments (provider_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX ix_appointments_agenda ON appointments (provider_id, status, starts_at)
    WHERE status IN ('PENDING','CONFIRMED');
CREATE INDEX ix_appointments_customer ON appointments (provider_id, customer_id, starts_at DESC);
CREATE INDEX ix_appointments_booked_by ON appointments (booked_by_user_id, starts_at DESC)
    WHERE booked_by_user_id IS NOT NULL;
