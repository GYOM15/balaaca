-- The salon was never told when its own customer changed the appointment.
--
-- A customer could call an appointment off, and the only message that produced
-- went to the customer - who already knew, having just pressed the button. The
-- provider learned by opening the diary. So a chair freed an hour before it was
-- due stayed blocked in the owner's head, and the walk-in standing in front of
-- them was turned away for a booking that no longer existed.
--
-- The same gap, wider, now that a customer can MOVE an appointment rather than
-- only cancel it: a diary that changes without telling anybody is a diary the
-- provider stops trusting.
--
-- Two new kinds and not a second recipient on the existing ones, for two
-- reasons that both matter. The dedupe key is intent plus the instant it is
-- owed for and carries no recipient, so two rows of one kind at one instant
-- would collide on uq_notifications_dedupe and one of them would be dropped
-- silently by ON CONFLICT DO NOTHING - the worse half of the pair being the one
-- that vanishes. And the two messages say different things to different people:
-- one names the business, the other names the customer. That is exactly why
-- BOOKING_NOTICE is not BOOKING_CONFIRMATION, and V023 made the same call for
-- the same reason.
--
-- Planned only when the CUSTOMER initiated it. A provider texted about their
-- own cancellation is a provider learning to ignore the channel.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('BOOKING_CONFIRMATION', 'BOOKING_ACCEPTED', 'BOOKING_NOTICE',
                    'REMINDER', 'CANCELLATION', 'RESCHEDULE',
                    'CANCELLATION_NOTICE', 'RESCHEDULE_NOTICE'));
