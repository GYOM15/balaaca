package com.balaaca.platformkernel.time;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * The one clock, injected everywhere and read nowhere else.
 *
 * <p>UTC, always. A service that reads the host's zone gives a different answer
 * on a developer's laptop than in production, and the difference shows up as a
 * booking an hour out rather than as an error.
 */
@ApplicationScoped
public class ClockProducer {

    private static final Logger LOG = Logger.getLogger(ClockProducer.class);

    /**
     * Pins the clock to one instant. Empty everywhere but the test profile.
     *
     * <p>It exists because the integration suite books at fixed dates -
     * "2026-09-04T10:00:00Z" appears fifty-six times - and those dates were
     * chosen for their DAY OF WEEK: the fixtures open Monday to Saturday, so a
     * test that books on a Sunday is testing the refusal, not the booking.
     * Written against the real clock, the whole suite therefore had an expiry
     * date, and it reached it: on 2026-09-02 every test booking 2026-09-01
     * started answering 422, correctly, because the slot was in the past.
     *
     * <p>Pinning the clock rather than rewriting the dates keeps what they
     * encode - a Tuesday, a Friday, a Monday - and makes the suite
     * deterministic instead of merely postponed. Dates computed from `now()`
     * would still drift across a weekend and fail on whichever day the fixtures
     * are shut.
     *
     * <p>Safe to pin ONLY because nothing in Java reads the time any other way:
     * no `Instant.now()`, no `LocalDate.now()`, no `ZoneId.systemDefault()`.
     *
     * <p>It is NOT safe for SQL, and this comment used to say it was. It
     * claimed the `now()` calls in the schema compared against effective dates
     * the fixtures leave null, and added that if that stopped being true, this
     * would stop being safe. It stopped being true, twice:
     *
     * <ul>
     *   <li>V038 refuses to retire a staff member on `starts_at >= now()`
     *   <li>V050's `app_may_review` decides on `p_ends_at <= now()`
     * </ul>
     *
     * <p>Both judge an APPOINTMENT against real time while the fixture that
     * placed it was written against this pinned instant, so the two disagree by
     * one more day every day. Four tests asserted the opposite of what they
     * meant on 2026-09-08, having passed the day before.
     *
     * <p>The rule that follows, and `BookingFixtures.stillToCome` exists for
     * it: a fixture whose outcome a SQL `now()` decides must place its row
     * RELATIVE to `now()`, never at a literal date. A literal date in such a
     * test is not a value, it is an expiry.
     */
    @ConfigProperty(name = "balaaca.clock.pinned-to")
    Optional<String> pinnedTo;

    @Produces
    @ApplicationScoped
    public Clock clock() {
        if (pinnedTo.isEmpty() || pinnedTo.get().isBlank()) {
            return Clock.systemUTC();
        }
        Instant instant = Instant.parse(pinnedTo.get().trim());
        // Loud on purpose. A pinned clock in an environment that did not mean
        // to pin one is a system that quietly books in the wrong week, and the
        // only way anybody would find out is a customer arriving on the wrong
        // day.
        LOG.warnf("Clock is PINNED to %s. This must never be a production setting.", instant);
        return Clock.fixed(instant, ZoneOffset.UTC);
    }
}
