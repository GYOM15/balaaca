-- The type-ahead was offering back a value nobody should copy.
--
-- `listAreas` exists for one reason: to stop a free-text field fragmenting. The
-- tenth hairdresser in Nongo is offered the "Nongo" the first nine wrote,
-- instead of inventing "nongo centre" beside it. What it offers is the spelling
-- MOST providers used - mode() over the raw column - and the raw column
-- accepted anything.
--
-- So a row holding '  RATOMA  ' was handed back as the suggested spelling, and
-- the eleventh hairdresser would have stored it verbatim. The fold that groups
-- them ignores the padding, so nothing looked wrong: two providers agreed, and
-- the value they agreed on had two spaces on each side.
--
-- Both write paths already trim - the profile resource and the booking mapper -
-- which is exactly why this is worth a constraint rather than a second trim.
-- The application doing it correctly today is not the same as the column being
-- unable to hold it, and the next path to set this field is the one that will
-- forget.
--
-- Case is deliberately NOT normalised. "Kipe" and "KIPÉ" fold to the same
-- group and mode() picks whichever providers actually wrote more often; a
-- provider's own capitalisation of their own neighbourhood is theirs, and the
-- generated column already makes the comparison blind to it.

UPDATE providers SET area = nullif(btrim(area), '')
 WHERE area IS NOT NULL AND area <> btrim(area);

ALTER TABLE providers
    ADD CONSTRAINT ck_providers_area_trimmed
    CHECK (area IS NULL OR (area = btrim(area) AND area <> ''));

-- The same field on the other side of the transaction: where the provider is
-- going. It is never offered as a suggestion, but it is shown to whoever has to
-- find the door, and a quartier that renders with three spaces in front of it
-- reads as a mistake in the address.
UPDATE appointments SET service_area = nullif(btrim(service_area), '')
 WHERE service_area IS NOT NULL AND service_area <> btrim(service_area);

ALTER TABLE appointments
    ADD CONSTRAINT ck_appointments_service_area_trimmed
    CHECK (service_area IS NULL
           OR (service_area = btrim(service_area) AND service_area <> ''));

-- And the directions, for the same reason and with more at stake: it is the
-- one field that actually gets a tradesman to the door, and it is required on
-- every call-out. A value of three spaces would satisfy NOT NULL, satisfy
-- ck_appointments_directions_pair, and tell nobody anything.
--
-- If a row ever holds nothing but whitespace, this migration STOPS on the
-- constraint rather than repairing it, and that is deliberate: the two
-- automatic answers are both wrong. NULL breaks the pair constraint on a
-- call-out, and a placeholder would be the platform inventing an address. A
-- human has to read the appointment and telephone the customer.
UPDATE appointments SET service_directions = btrim(service_directions)
 WHERE service_directions IS NOT NULL AND service_directions <> btrim(service_directions);

ALTER TABLE appointments
    ADD CONSTRAINT ck_appointments_directions_meaningful
    CHECK (service_directions IS NULL OR btrim(service_directions) <> '');
