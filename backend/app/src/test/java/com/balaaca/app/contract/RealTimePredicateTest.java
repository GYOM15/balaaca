package com.balaaca.app.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Every place the schema judges a stored row against the REAL clock.
 *
 * <p>The test suite pins the application's clock to a fixed instant so its
 * fixtures keep the day of week they encode. PostgreSQL's {@code now()} is
 * pinned by nothing, so the two drift apart by a day every day, and any fixture
 * placed at a literal date is future for one and past for the other soon after.
 *
 * <p>That is not a hypothetical. {@code ReviewIT} and {@code StaffDepartureIT}
 * both booked at {@code 2026-09-07T10:00:00Z}; on 2026-09-08 four of their tests
 * began asserting the opposite of what they meant, and passed the day before.
 * The comment on {@code ClockProducer} had named the exact condition that made
 * pinning safe, and V038 and V050 broke it without anything noticing.
 *
 * <p>So the list is closed and this test is the argument. Adding a predicate
 * here is allowed; adding one without reading this is not. A fixture whose
 * outcome one of these decides must place its row RELATIVE to {@code now()} -
 * see {@code BookingFixtures.stillToCome}. A literal date in such a test is not
 * a value, it is an expiry.
 */
class RealTimePredicateTest {

    private static final Path MIGRATIONS =
            Path.of("src", "main", "resources", "db", "migration");

    /** A column or parameter compared to {@code now()}, either way round. */
    private static final Pattern COMPARISON = Pattern.compile(
            "([a-z_.]+)\\s*(<=|>=|<|>)\\s*now\\(\\)|now\\(\\)\\s*(<=|>=|<|>)\\s*([a-z_.]+)");

    /**
     * Every comparison the schema is known to make, and what a fixture feeding
     * it has to do about it.
     */
    private static final Set<String> KNOWN = Set.of(
            // An invitation expires. Fixtures set the expiry relative to now()
            // on both sides, so nothing drifts.
            "ps.invitation_expires_at > now()",
            // V038: a staff member with a booking still to come cannot be
            // retired. StaffDepartureIT.bookWithLeaver moves its row forward.
            "starts_at >= now()",
            // V050: app_may_review decides a visit has happened.
            // ReviewIT.served moves a row back, stillToCome moves one forward.
            "p_ends_at <= now()");

    @Test
    @DisplayName("no migration judges a row against real time without saying so here")
    void theListOfRealTimePredicatesIsClosed() throws IOException {
        Set<String> found = new TreeSet<>();
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".sql")).toList()) {
                found.addAll(predicatesIn(read(file)));
            }
        }

        Set<String> unlisted = new TreeSet<>(found);
        unlisted.removeAll(KNOWN);
        assertThat(unlisted)
                .as("""
                    A migration compares a stored row to PostgreSQL's now(), \
                    which the test suite's pinned clock does not control. Any \
                    fixture whose outcome this decides must place its row \
                    relative to now() rather than at a literal date, or it will \
                    pass until the day it silently starts asserting the \
                    opposite. Add it to KNOWN once the fixtures that feed it \
                    are relative.""")
                .isEmpty();

        Set<String> vanished = new TreeSet<>(KNOWN);
        vanished.removeAll(found);
        assertThat(vanished)
                .as("""
                    A predicate listed here is no longer in the schema. Remove \
                    it, so the list keeps meaning what it says.""")
                .isEmpty();
    }

    /** The comparisons in one migration, normalised to single spaces. */
    private static List<String> predicatesIn(String sql) {
        Matcher matcher = COMPARISON.matcher(stripComments(sql));
        List<String> found = new java.util.ArrayList<>();
        while (matcher.find()) {
            found.add(matcher.group(1) != null
                    ? matcher.group(1) + " " + matcher.group(2) + " now()"
                    : "now() " + matcher.group(3) + " " + matcher.group(4));
        }
        return found;
    }

    /**
     * Comments are dropped first. This file's own explanations quote these
     * predicates, and a migration that discussed one would otherwise register
     * as declaring it.
     */
    private static String stripComments(String sql) {
        return sql.replaceAll("(?m)--.*$", "");
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("could not read " + file, e);
        }
    }
}
