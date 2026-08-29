-- Recurring opening hours, in the provider's LOCAL time. Breaks are the gaps
-- between segments; there is no separate break table.
CREATE TABLE availability_rules (
    id             uuid PRIMARY KEY,
    provider_id    uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id       uuid NOT NULL,
    day_of_week    smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- ISO, 1 = Monday
    start_time     time NOT NULL,
    end_time       time NOT NULL,
    effective_from date,
    effective_to   date,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    -- Not start < end: a provider open 22:00-01:00 is real. end < start means
    -- the window wraps into the next local date. Equal is the only nonsense.
    CONSTRAINT ck_availability_rules_span CHECK (start_time <> end_time),
    CONSTRAINT ck_availability_rules_period
        CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from),
    FOREIGN KEY (provider_id, staff_id) REFERENCES provider_staff (provider_id, id)
);
CREATE INDEX ix_availability_rules_lookup ON availability_rules (provider_id, staff_id, day_of_week);

-- Closures, holidays and one-off hours, by local date.
CREATE TABLE availability_overrides (
    id            uuid PRIMARY KEY,
    provider_id   uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    staff_id      uuid NOT NULL,
    override_date date NOT NULL,
    kind          varchar(20) NOT NULL CHECK (kind IN ('CLOSED','CUSTOM_HOURS')),
    start_time    time,
    end_time      time,
    reason        varchar(200),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_availability_overrides_shape CHECK (
        (kind = 'CLOSED'       AND start_time IS NULL AND end_time IS NULL) OR
        (kind = 'CUSTOM_HOURS' AND start_time IS NOT NULL AND end_time IS NOT NULL
                               AND start_time <> end_time)),
    FOREIGN KEY (provider_id, staff_id) REFERENCES provider_staff (provider_id, id)
);
CREATE INDEX ix_availability_overrides_lookup
    ON availability_overrides (provider_id, staff_id, override_date);
