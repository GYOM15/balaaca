package com.balaaca.providers.ports.inbound;

import java.time.Instant;
import java.util.Optional;

/**
 * A business answering the platform back.
 *
 * <p>The third of the triptych moderation needs. V036 gave the platform a trace
 * and a way back; what a suspended provider had was the reason on their own
 * dashboard and nothing to do with it. That asymmetry is what separates a
 * platform from an arbitrary one.
 *
 * <p>One message per suspension, enforced by the schema rather than by a rate
 * limit: a business that presses twice meant it once, and the only situation
 * where a second message is about something new is being suspended again.
 */
public interface ContestSuspensionUseCase {

    /**
     * @throws com.balaaca.providers.domain.NotSuspendedException when the
     *         business is not suspended - there is nothing to contest, and
     *         accepting the message would put it in a queue about a decision
     *         nobody took
     * @throws com.balaaca.providers.domain.AlreadyContestedException when this
     *         suspension has already been answered
     */
    Contestation contest(String message);

    /** What the provider sent about the suspension they are under, if anything. */
    Optional<Contestation> current();

    record Contestation(String message, Instant submittedAt,
                        Instant aboutSuspensionAt, boolean read) {
    }
}
