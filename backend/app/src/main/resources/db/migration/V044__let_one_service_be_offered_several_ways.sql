-- Three product shapes squeezed out of two columns, and a service could only be
-- one of them.
--
-- V027 added `turnaround_hours` and made its NULLNESS the discriminant between
-- sit-and-wait and drop-off. V031 added `location_kind` and made AT_CUSTOMER the
-- third. `ck_service_offerings_one_shape` then forbade the pairing, and V031's
-- own comment on ServiceLocation says why the schema refused an "either" value:
-- the booking form would not know whether to ask for an address.
--
-- That reasoning was right about the FORM and wrong about the SERVICE. A braider
-- who does "Tresses" in the salon and also at the customer's house is selling one
-- service two ways, and the platform made her publish two. Two rows means two
-- prices to keep in step, two sets of photographs, two entries in a catalogue a
-- customer reads on a telephone, and one of them retired the day she changes
-- anything. The form's problem is real and it is solved where it lives: the
-- customer chooses at booking, and the choice is frozen onto the appointment.
--
--
-- Three flags, not an enum column, not an array, not a child table
--
-- What is being modelled is a SET drawn from a closed three-value domain, and
-- three booleans are the only shape of it that the database can constrain
-- completely in one line each. "At least one" is `a OR b OR c`. "The turnaround
-- belongs to the drop-off" is an equality between two columns.
--
-- An array needs a subquery to forbid duplicates, and a CHECK may not contain
-- one - so `{ON_SITE, ON_SITE}` would be storable. A child table is three more
-- objects, an RLS policy, a grant and a join on the hottest read in the product,
-- to hold at most three rows per service. A fourth mode would cost a column, and
-- a fourth mode is not on the horizon: these three are the whole taxonomy of how
-- work reaches a customer.
--
--
-- What does NOT change, and it is the important half
--
-- One price and one duration, per service, whichever way it is fulfilled. A
-- surcharge for travelling to somebody's house is a pricing model nobody has
-- decided, and inventing one here would change what a customer is quoted after
-- they have already seen a number on the page. So `price_amount_minor` and
-- `duration_minutes` stay exactly where they are, and a provider who genuinely
-- charges more to travel still publishes two services - which is the same answer
-- as before, now applied only to the case that actually differs.
--
-- One turnaround too. It is the promise attached to the drop-off mode, so it
-- exists exactly when that mode is offered, and an ON_SITE booking of a service
-- that also does drop-off freezes no turnaround and gets no `ready_by`.

-- ---------------------------------------------------------------------------
-- 1. The modes a service offers
-- ---------------------------------------------------------------------------
-- DEFAULT false on all three, deliberately: an INSERT that names no mode is
-- refused by the CHECK below rather than being quietly filed as on-site. The
-- default is there so the ADD COLUMN does not rewrite the table, not to supply
-- an answer.
ALTER TABLE service_offerings
    ADD COLUMN offers_on_site     boolean NOT NULL DEFAULT false,
    ADD COLUMN offers_drop_off    boolean NOT NULL DEFAULT false,
    ADD COLUMN offers_at_customer boolean NOT NULL DEFAULT false;

-- Loss-free by construction: the two old columns encoded exactly three states
-- and each maps to exactly one flag. Nothing is inferred and nothing is
-- widened - a service that was on-site yesterday offers on-site and nothing
-- else today, and it is the provider's job to add a second mode if they want
-- one.
UPDATE service_offerings SET
    offers_on_site     = (location_kind = 'AT_PROVIDER' AND turnaround_hours IS NULL),
    offers_drop_off    = (location_kind = 'AT_PROVIDER' AND turnaround_hours IS NOT NULL),
    offers_at_customer = (location_kind = 'AT_CUSTOMER');

-- ---------------------------------------------------------------------------
-- 2. The old discriminants go
-- ---------------------------------------------------------------------------
-- `location_kind` is not kept beside the flags. It cannot express the state this
-- migration exists to allow - a service that is both on-site and at-customer -
-- so it would be a column that is wrong for exactly the rows that matter, and
-- two columns that can disagree about one fact is the shape V027 refused for
-- the same reason.
--
-- Both CHECKs named here reference the column and would be dropped with it; they
-- are named explicitly so that a wrong name fails this migration rather than
-- being silently absent from the next one.
ALTER TABLE service_offerings
    DROP CONSTRAINT ck_service_offerings_one_shape,
    DROP CONSTRAINT ck_service_offerings_location_kind,
    DROP COLUMN location_kind;

ALTER TABLE service_offerings
    -- A service nobody can obtain is a row with no meaning.
    ADD CONSTRAINT ck_service_offerings_offers_one
        CHECK (offers_on_site OR offers_drop_off OR offers_at_customer),
    -- The promise belongs to the mode. Both directions matter: a drop-off with
    -- no delay announced is a promise nobody made, and a delay on a service you
    -- cannot drop anything off at is a number no customer will ever be told.
    ADD CONSTRAINT ck_service_offerings_turnaround_is_drop_off
        CHECK ((turnaround_hours IS NOT NULL) = offers_drop_off);

COMMENT ON COLUMN service_offerings.offers_drop_off IS
    'Hand the work over and come back. When true, duration_minutes is the '
    'HANDOVER at the counter and turnaround_hours is the announced delay - '
    'never the length of the work, which occupies the workshop and not a chair.';
COMMENT ON COLUMN service_offerings.offers_at_customer IS
    'The provider travels. An appointment booked this way carries the address '
    'and the directions; one booked any other way must not.';

-- ---------------------------------------------------------------------------
-- 3. The appointment freezes the CHOICE, not the offering's shape
-- ---------------------------------------------------------------------------
-- This is the column the whole change turns on. Until now the shape could be
-- re-derived from the offering because the offering only had one; from here the
-- offering may have three and only the appointment knows which the customer
-- picked. Frozen like the price, the duration and the buffers before it: a
-- braider who stops travelling must not turn Thursday's house call into a chair
-- in her salon.
ALTER TABLE appointments ADD COLUMN service_fulfilment varchar(16);

UPDATE appointments SET service_fulfilment = CASE
    WHEN service_location_kind = 'AT_CUSTOMER' THEN 'AT_CUSTOMER'
    WHEN turnaround_hours IS NOT NULL          THEN 'DROP_OFF'
    ELSE                                            'ON_SITE'
END;

ALTER TABLE appointments
    ALTER COLUMN service_fulfilment SET NOT NULL,
    ADD CONSTRAINT ck_appointments_fulfilment
        CHECK (service_fulfilment IN ('ON_SITE', 'DROP_OFF', 'AT_CUSTOMER')),
    -- The offering may now carry a turnaround while this booking of it is not a
    -- drop-off at all. Freezing the offering's turnaround unconditionally would
    -- promise a customer who sat in the chair that something would be ready on
    -- Friday.
    ADD CONSTRAINT ck_appointments_turnaround_is_drop_off
        CHECK ((turnaround_hours IS NOT NULL) = (service_fulfilment = 'DROP_OFF'));

-- ---------------------------------------------------------------------------
-- 4. And the old column goes, with the three rules that were written on it
-- ---------------------------------------------------------------------------
-- Redundant now: AT_CUSTOMER is AT_CUSTOMER, and AT_PROVIDER is "ON_SITE or
-- DROP_OFF". Every rule V031 expressed on it is re-expressed here on the column
-- that survives, unchanged in meaning.
--
-- DROP COLUMN takes ix_appointments_call_outs with it - a partial index whose
-- predicate names the column - so it is rebuilt below rather than lost.
ALTER TABLE appointments
    DROP CONSTRAINT ck_appointments_directions_pair,
    DROP CONSTRAINT ck_appointments_address_only_on_call_out,
    DROP CONSTRAINT ck_appointments_location_kind,
    DROP COLUMN service_location_kind;

ALTER TABLE appointments
    -- Directions exist exactly when the provider travels. An at-customer
    -- appointment with no directions is a job nobody can do, and any other
    -- appointment carrying them is a customer's home address stored for no
    -- reason at all.
    ADD CONSTRAINT ck_appointments_directions_pair
        CHECK ((service_fulfilment = 'AT_CUSTOMER') = (service_directions IS NOT NULL)),
    ADD CONSTRAINT ck_appointments_address_only_on_call_out
        CHECK (service_fulfilment = 'AT_CUSTOMER'
               OR (service_locality_id IS NULL AND service_area IS NULL));

-- The diary's own question - "what am I driving to this week?" - answered
-- without reading every row. Partial, because the overwhelming majority of
-- appointments on this platform will always happen at the shop.
CREATE INDEX ix_appointments_call_outs ON appointments (provider_id, starts_at)
    WHERE service_fulfilment = 'AT_CUSTOMER';

COMMENT ON COLUMN appointments.service_fulfilment IS
    'How this booking is fulfilled, chosen by the customer among the modes the '
    'offering published, and frozen. Not re-derivable from the offering: the '
    'offering may now publish several.';
