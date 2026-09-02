package com.balaaca.booking.ports.inbound;

import java.time.Duration;

/**
 * Makes guessing a booking reference cost something.
 *
 * <p>The reference is six symbols over an alphabet of 31 - 887 million per
 * prefix, and a prefix is shared by every business whose initials match. That is
 * a large number to type and a small one to iterate, and it is the only thing
 * authorising a stranger to read, move, cancel or report one appointment. The
 * short form was accepted on the condition that this exists, so it is not a
 * courtesy to the server: it is the second half of the authorisation.
 *
 * <p>Two operations rather than one, because the answer and the charge happen at
 * different moments. The edge asks {@link #mayTry} BEFORE it looks anything up,
 * so a caller whose budget is spent is refused whatever they hold - including a
 * reference that would have worked. That is deliberate: if a spent budget still
 * answered 200 for a real reference and 429 for a wrong one, the refusal would
 * itself be the oracle, and an attacker could keep walking the space reading the
 * status code.
 */
public interface GuardBookingReferenceUseCase {

    /**
     * @param caller who is asking, as the edge identifies them - never the
     *               reference. Keyed on the reference, an attacker walks the
     *               space one fresh key at a time and never trips anything.
     */
    Verdict mayTry(String caller);

    /**
     * Charges one reference that named nothing.
     *
     * <p>Only the misses are counted. A customer holding their own reference can
     * open it as often as they like, and that is what lets one caller identity
     * stand for many people without turning the limit into an outage - which is
     * exactly the situation today, since the front end calls this API from its
     * own server and every customer arrives from one address.
     */
    void referenceWasWrong(String caller);

    /**
     * @param retryAfter how long to wait, and the same fixed window whoever
     *                   asks: derived from what is left of the budget it would
     *                   tell a caller where in the window they are standing
     */
    record Verdict(boolean allowed, Duration retryAfter) {

        public static Verdict granted() {
            return new Verdict(true, Duration.ZERO);
        }

        public static Verdict refusedFor(Duration retryAfter) {
            return new Verdict(false, retryAfter);
        }
    }
}
