-- Who in the team actually does this.
--
-- Until now, nobody could say. `eligibleStaff(serviceOfferingId)` took a service
-- and ignored it: any bookable, active member of the team could be assigned any
-- service the business offers. For a solo barber that is correct and always
-- will be. For the salon with a braider and a nail technician - which is most of
-- them, and the reason provider_staff exists at all - it means a customer books
-- braids and the server hands the appointment to whoever is least busy, which
-- is as likely to be the person who does not braid.
--
-- The other half of the same gap is the customer-facing one: a customer who
-- picks Fatou by name for a service Fatou does not perform is accepted, and
-- nobody finds out until Thursday.
--
--
-- Why a row means CAN, and its absence means CANNOT
--
-- The alternative - a row meaning "excluded", absence meaning "performs" - reads
-- as friendlier, because a new service works for everybody with no rows at all.
-- It is the wrong way round for one reason: the failure of an exclusion table is
-- silent and the failure of a grant table is loud. Forget to write an exclusion
-- and the customer is quietly sent to the wrong person; forget to write a grant
-- and the service has nobody who can do it, which is visible on the first
-- booking attempt and fixable in one click.
--
-- So the semantics are strict, and everything below exists to make sure the
-- strictness never surprises anybody who did not ask for it.
--
--
-- Nothing changes for anyone who has already registered
--
-- Two mechanisms, and both are needed.
--
-- The backfill at the bottom writes the cartesian product per provider: every
-- staff row against every service that provider offers. That is exactly the
-- rule the code enforced yesterday, made explicit, so no existing salon wakes
-- up to a diary that refuses bookings.
--
-- And the application grants on creation, in both directions: a new service is
-- granted to the whole team, and a new colleague is granted the whole
-- catalogue. That is what Fresha, Booksy and Treatwell all do, and it is the
-- only way strict semantics stay invisible to a provider who never opens the
-- competence screen. The screen is then a way to REMOVE somebody, which is how
-- a provider thinks about it anyway: "Fatou doesn't do nails".

CREATE TABLE staff_service_offerings (
    provider_id         uuid        NOT NULL,
    staff_id            uuid        NOT NULL,
    service_offering_id uuid        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (staff_id, service_offering_id),

    -- Composite, against the UNIQUE (provider_id, id) both parents declare.
    -- This is what makes it impossible to grant one provider's employee a
    -- competence in another provider's catalogue: the pair would have to exist
    -- in both parents under the same provider_id, and it cannot.
    CONSTRAINT fk_staff_service_offerings_staff
        FOREIGN KEY (provider_id, staff_id)
        REFERENCES provider_staff (provider_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_service_offerings_offering
        FOREIGN KEY (provider_id, service_offering_id)
        REFERENCES service_offerings (provider_id, id) ON DELETE CASCADE
);

-- The primary key already serves "which services does this person do". This is
-- the other direction - "who can take this booking" - which is the one the
-- booking path asks on every single request.
CREATE INDEX ix_staff_service_offerings_by_offering
    ON staff_service_offerings (provider_id, service_offering_id);

ALTER TABLE staff_service_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_service_offerings FORCE  ROW LEVEL SECURITY;

-- One policy, and no public-read companion. A customer never reads this table:
-- the public slot path binds the provider from the slug before it asks
-- anything, so app_current_provider() is set and this predicate admits the
-- rows. A public-read policy would publish which named employee performs which
-- service to unauthenticated callers, which is a fact about people and not
-- about the shop.
CREATE POLICY staff_service_offerings_tenant ON staff_service_offerings
    FOR ALL
    USING      (provider_id = app_current_provider())
    WITH CHECK (provider_id = app_current_provider());

-- FORCE binds the owner too, so the backfill below would match zero rows and
-- report success without this.
CREATE POLICY staff_service_offerings_maintenance ON staff_service_offerings
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON staff_service_offerings TO balaaca_app;

-- The rule as it stood yesterday, written down. Every staff row, not only the
-- bookable and active ones: the eligibility query filters those itself, and
-- reproducing its predicate here would mean an employee who comes back from
-- leave returns with an empty competence list.
INSERT INTO staff_service_offerings (provider_id, staff_id, service_offering_id)
SELECT s.provider_id, s.id, o.id
  FROM provider_staff s
  JOIN service_offerings o ON o.provider_id = s.provider_id;
