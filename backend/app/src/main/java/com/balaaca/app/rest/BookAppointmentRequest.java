package com.balaaca.app.rest;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/**
 * What a customer sends to book.
 *
 * <p>There is no provider field and no price field. The provider comes from the
 * slug in the path, and the price is frozen from the offering server-side - a
 * client-supplied price is the oldest trick there is. There is no duration or
 * end time either: both follow from the offering.
 *
 * <p>staffId is omitted, never null, to let the server choose.
 */
public record BookAppointmentRequest(
        @NotNull UUID serviceOfferingId,
        UUID staffId,
        @NotNull Instant startsAt,
        @NotNull @Valid Customer customer,
        @Size(max = 500) String customerNote) {

    public record Customer(
            @NotBlank @Size(max = 120) String fullName,
            @NotBlank @Size(max = 24) String phone,
            @Size(max = 255) String email) {
    }
}
