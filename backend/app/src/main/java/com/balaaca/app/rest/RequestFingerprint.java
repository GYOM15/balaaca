package com.balaaca.app.rest;

import com.balaaca.app.api.model.BookAppointmentRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Hashes what the CLIENT sent, so a replayed idempotency key can be checked
 * against the request it was first used for.
 *
 * <p>Only client-supplied fields go in. Hashing a server-resolved value - the
 * chosen staff member, the upserted customer id - would make an honest retry
 * after a timeout produce a different hash and be rejected as a reuse, which is
 * the opposite of what idempotency is for.
 */
public final class RequestFingerprint {

    private RequestFingerprint() {
    }

    public static String of(BookAppointmentRequest r) {
        String canonical = String.join("|",
                String.valueOf(r.getServiceOfferingId()),
                String.valueOf(r.getStaffId()),
                // The instant, not the wire text: +00:00 and Z are the same
                // moment, and a retry that spells it differently is still the
                // same request.
                String.valueOf(r.getStartsAt().toInstant()),
                String.valueOf(r.getCustomer().getPhone()),
                String.valueOf(r.getCustomer().getFullName()));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the platform", e);
        }
    }
}
