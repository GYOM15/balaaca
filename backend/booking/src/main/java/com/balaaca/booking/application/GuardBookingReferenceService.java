package com.balaaca.booking.application;

import com.balaaca.booking.ports.inbound.GuardBookingReferenceUseCase;
import com.balaaca.booking.ports.outbound.GuessBudget;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;

/**
 * The budget, and the numbers behind it.
 *
 * <p>Thirty wrong references in ten minutes. From the guesser's side that is
 * 180 an hour, and 887 million of them is half a million years for one caller -
 * the space stops being walkable and the reference is allowed to stay short.
 * From a customer's side thirty mistakes in ten minutes is not a person typing
 * something off a screen; it is a loop.
 *
 * <p>Not transactional and not audited. Nothing here writes to the database, and
 * a row per refused guess would be an attacker choosing how fast this table
 * grows.
 */
@ApplicationScoped
public class GuardBookingReferenceService implements GuardBookingReferenceUseCase {

    private static final int WRONG_REFERENCES_PER_WINDOW = 30;
    private static final Duration WINDOW = Duration.ofMinutes(10);

    /**
     * Scoped, because Redis holds the registration limiter's counters too and a
     * shared name would be two rules spending one budget.
     */
    private static final String KEY_PREFIX = "ratelimit:booking-reference:";

    private final GuessBudget budget;

    public GuardBookingReferenceService(GuessBudget budget) {
        this.budget = budget;
    }

    @Override
    public Verdict mayTry(String caller) {
        return budget.hasBudget(KEY_PREFIX + caller, WRONG_REFERENCES_PER_WINDOW)
                ? Verdict.granted()
                : Verdict.refusedFor(WINDOW);
    }

    @Override
    public void referenceWasWrong(String caller) {
        budget.charge(KEY_PREFIX + caller, WINDOW);
    }
}
