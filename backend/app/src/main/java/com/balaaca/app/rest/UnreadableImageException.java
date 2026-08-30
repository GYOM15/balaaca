package com.balaaca.app.rest;

import com.balaaca.sharedkernel.error.DomainException;

/**
 * The request carried no readable body.
 *
 * <p>Distinct from an image the platform refuses: this one never got as far as
 * being an image at all, and saying so stops a provider hunting for a problem
 * with their photo.
 */
public final class UnreadableImageException extends DomainException {

    public UnreadableImageException() {
        super("VALIDATION_FAILED", 400, "No image was received");
    }
}
