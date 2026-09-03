-- Where the work happens.
--
-- V025 widened the trades and, doing so, admitted seven whose transaction is
-- the opposite of a salon's: a plumber, an electrician, a cleaner, a mover, an
-- air-conditioning or solar fitter and a pest controller do not receive the
-- customer - they travel to them. V027 already made the same admission from the
-- other direction for work that is dropped off. This is the third and last
-- shape: the provider goes out.
--
-- The gap that leaves is not cosmetic. Every one of those appointments needs an
-- address, and until now there was nowhere to put one: the booking form asked
-- for a name, a phone and a note, and the note is a free line the provider
-- reads if they remember to. A plumber whose diary cannot say where the leak is
-- has a diary they cannot use.
--
--
-- Why there are no coordinates here, and no plus code either
--
-- The obvious modelling for "where" is a latitude and a longitude, and it is
-- wrong for this product for a reason worth writing down rather than
-- rediscovering. A pair of coordinates is precise to a metre, it is a
-- surveillance-grade fact about a private home, and once a column exists
-- something will fill it - from a browser geolocation prompt the customer
-- clicked through, most likely - and then the platform is holding the exact
-- dwelling of every person who ever booked a plumber. Nothing in the product
-- reads it: there is no map, no routing, no dispatch, no distance sort. It
-- would be a liability stored for a feature that does not exist.
--
-- Plus Code (Open Location Code) was the near miss. It is genuinely the right
-- standard for a country where most homes have no street address, it is what
-- Google Maps offers in Conakry, and a customer CAN read one off their phone.
-- But a stored plus code is coordinates with the decimal point moved: "7CJ5
-- MJ8P+3F" is a fourteen-metre square, and the whole paragraph above applies to
-- it unchanged. So it is accepted as INPUT - a customer may paste one into the
-- directions and it is exactly the useful thing to paste - and it is stored as
-- what the customer wrote, in the same free line as "behind the Nongo mosque,
-- blue gate". It is never parsed into a geometry column, and PostGIS is not
-- installed.
--
-- what3words was refused outright: it is proprietary, its wordlist is licensed,
-- and building an address model on a vocabulary one company owns is a
-- dependency this repository has no way to fork.
--
-- What is left is what a Guinean tradesman actually asks on the phone: which
-- commune, which quartier, and then how to find the door. That is a locality, an
-- area and a line of directions - the same three fields V028 to V030 gave the
-- provider for its own address, which is not a coincidence: a customer
-- describing where they live and a business describing where it is are the same
-- problem, and solving it twice differently would give the country two maps.

-- ---------------------------------------------------------------------------
-- The offering says whether the provider travels.
-- ---------------------------------------------------------------------------

-- Default AT_PROVIDER, and that is the honest backfill: every service that
-- exists today was created by a salon, a barber or a tailor, and every one of
-- them receives the customer.
ALTER TABLE service_offerings
    ADD COLUMN location_kind varchar(16) NOT NULL DEFAULT 'AT_PROVIDER';

ALTER TABLE service_offerings
    ADD CONSTRAINT ck_service_offerings_location_kind
    CHECK (location_kind IN ('AT_PROVIDER', 'AT_CUSTOMER'));

-- The two shapes are mutually exclusive, and stating it here is what stops a
-- nonsense offering from ever reaching the booking path. Drop-off means the
-- customer brings the thing to the workshop and collects it later; at-customer
-- means the provider travels. A service that is both would be asking the
-- customer to deliver an item to their own house.
ALTER TABLE service_offerings
    ADD CONSTRAINT ck_service_offerings_one_shape
    CHECK (NOT (location_kind = 'AT_CUSTOMER' AND turnaround_hours IS NOT NULL));

-- ---------------------------------------------------------------------------
-- The appointment freezes it, with the address.
-- ---------------------------------------------------------------------------

-- Frozen at booking, like the price, the duration, the buffers and the
-- turnaround before it. A provider that later stops travelling must not
-- retroactively turn a booked call-out into a shop appointment - the customer
-- is expecting someone at their door on Thursday.
ALTER TABLE appointments
    ADD COLUMN service_location_kind varchar(16) NOT NULL DEFAULT 'AT_PROVIDER';

ALTER TABLE appointments
    ADD CONSTRAINT ck_appointments_location_kind
    CHECK (service_location_kind IN ('AT_PROVIDER', 'AT_CUSTOMER'));

-- The commune or prefecture, from the same closed map the directory filters by.
-- Nullable even on a call-out: a customer who says "Nongo, behind the mosque"
-- has told the plumber everything he needs, and refusing the booking because
-- they did not also pick a commune from a list would lose the booking.
ALTER TABLE appointments
    ADD COLUMN service_locality_id uuid REFERENCES localities (id);

-- The quartier, as the customer wrote it. Same width and same reasoning as
-- providers.area: it is free text because the country's quartiers are thousands
-- of rows this platform does not author.
ALTER TABLE appointments ADD COLUMN service_area varchar(80);

-- How to find the door. This is the field that actually gets the tradesman
-- there, so it is the one that is required when the provider travels.
ALTER TABLE appointments ADD COLUMN service_directions varchar(500);

-- Directions exist exactly when the provider travels. Both halves matter: an
-- at-customer appointment with no directions is a job nobody can do, and an
-- at-provider appointment carrying an address is a customer's home address
-- stored for no reason at all.
ALTER TABLE appointments
    ADD CONSTRAINT ck_appointments_directions_pair
    CHECK ((service_location_kind = 'AT_CUSTOMER') = (service_directions IS NOT NULL));

-- And the two optional halves follow the same rule: nothing about where the
-- customer lives is stored for an appointment that happens at the shop.
ALTER TABLE appointments
    ADD CONSTRAINT ck_appointments_address_only_on_call_out
    CHECK (service_location_kind = 'AT_CUSTOMER'
           OR (service_locality_id IS NULL AND service_area IS NULL));

-- The diary's own question - "what am I driving to this week?" - answered
-- without reading every row. Partial, because the overwhelming majority of
-- appointments on this platform will always happen at the shop.
CREATE INDEX ix_appointments_call_outs ON appointments (provider_id, starts_at)
    WHERE service_location_kind = 'AT_CUSTOMER';
