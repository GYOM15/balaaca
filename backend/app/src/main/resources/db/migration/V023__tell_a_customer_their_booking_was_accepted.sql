-- A customer whose booking needed accepting was never told it had been.
--
-- BOOKING_CONFIRMATION is planned at booking time, before the provider has seen
-- anything. For a provider that vets its bookings - auto_confirm false - the
-- appointment then sits PENDING until someone presses a button, and
-- MoveAppointmentService.confirm() is a bare conditional UPDATE that plans
-- nothing. So the one message the customer is waiting for is the one message
-- the system never sends, and adding WhatsApp credentials would not have fixed
-- it: there was no row to send.
--
-- A separate kind rather than a second BOOKING_CONFIRMATION, because they say
-- different things. One says "we have your request", the other says "the salon
-- is expecting you", and a template that has to mean both means neither.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('BOOKING_CONFIRMATION', 'BOOKING_ACCEPTED', 'BOOKING_NOTICE',
                    'REMINDER', 'CANCELLATION', 'RESCHEDULE'));
