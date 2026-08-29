CREATE TABLE provider_categories (
    id         uuid PRIMARY KEY,
    slug       varchar(60) NOT NULL UNIQUE,
    label_fr   varchar(80) NOT NULL,
    icon       varchar(40),
    sort_order int     NOT NULL DEFAULT 0,
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
