package com.balaaca.app.rest;

import java.util.UUID;

/** Deliberately thin: an id is all a customer needs, and all they should get. */
public record AppointmentCreatedResponse(UUID appointmentId) {
}
