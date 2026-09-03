package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The other half of a reference somebody can read down a telephone.
 *
 * <p>Six symbols over an alphabet of 31 is 887 million per prefix, and a prefix
 * is shared by every business whose initials match. That is a lot to type and
 * not much to iterate, and the whole of it authorises reading, moving,
 * cancelling and reporting one appointment. The short form was accepted on the
 * condition that walking the space is refused, so these tests are not about a
 * server protecting itself - they are about the reference being safe to publish
 * at that length.
 *
 * <p>Redis outlives a truncated database, which is why every test here starts
 * with {@link BookingFixtures#reset()} - it flushes the counter along with the
 * tables. Without it the second test would inherit the first one's spent budget.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class BookingGuessLimitIT {

    private static final String BOOK = "/v1/providers/salon-fatou/appointments";

    /** Thirty wrong references in ten minutes, from GuardBookingReferenceService. */
    private static final int BUDGET = 30;

    /** The minted alphabet: no 0, O, 1, I or L. */
    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    private static String book() {
        return given().contentType("application/json")
                .header("Idempotency-Key", "key-" + UUID.randomUUID())
                .body("""
                      {"service_offering_id":"%s","starts_at":"2026-09-04T10:00:00Z",
                       "customer":{"full_name":"Mariama B.","phone":"622000001"}}
                      """.formatted(BookingFixtures.SALON_OFFERING))
                .when().post(BOOK).then().statusCode(201)
                .extract().jsonPath().getString("reference");
    }

    /**
     * The nth reference a guesser would try: well formed, correctly prefixed for
     * Salon Fatou, and never minted. It has to be well formed or the path's own
     * pattern answers 400 and the budget is never consulted - which would make
     * this test pass while proving nothing.
     */
    private static String guess(int n) {
        StringBuilder body = new StringBuilder();
        for (int i = 0, value = n; i < 6; i++, value /= ALPHABET.length()) {
            body.append(ALPHABET.charAt(value % ALPHABET.length()));
        }
        return "SFA-" + body;
    }

    private static int get(String reference) {
        return given().when().get("/v1/bookings/" + reference).then().extract().statusCode();
    }

    @Test
    @DisplayName("A guesser runs out of budget long before they run out of references")
    void theSpaceCannotBeWalked() {
        int refused = 0;
        for (int i = 0; i < BUDGET; i++) {
            if (get(guess(i)) == 404) {
                refused++;
            }
        }

        assertThat(refused)
                .as("the first tries are answered honestly, and each costs one")
                .isEqualTo(BUDGET);

        given().when().get("/v1/bookings/" + guess(BUDGET))
                .then().statusCode(429)
                .body("code", equalTo("RATE_LIMITED"))
                // Seconds, and the whole window rather than what is left of it:
                // a limit that says where in the window you are standing is one
                // an attacker paces themselves against.
                .header("Retry-After", equalTo("600"));
    }

    @Test
    @DisplayName("A spent budget refuses a reference that would have worked")
    void theRefusalIsNotAnOracle() {
        String mine = book();

        for (int i = 0; i < BUDGET; i++) {
            get(guess(i));
        }

        // This is the point of asking the budget BEFORE the lookup. If a spent
        // budget still answered 200 for a real reference and 429 for a wrong
        // one, the refusal would be the oracle it exists to close, and the
        // guesser could keep walking the space reading the status code.
        assertThat(get(mine)).isEqualTo(429);
    }

    @Test
    @DisplayName("Holding a real reference costs nothing")
    void aCustomerIsNotAGuesser() {
        String mine = book();

        // More opens than the budget has room for. Only the misses are counted,
        // and that is what lets one caller identity stand for many people -
        // which it does today, because the front end calls this API from its own
        // server and every customer arrives from that one address.
        for (int i = 0; i <= BUDGET; i++) {
            assertThat(get(mine)).as("opening your own booking, %d times over", i + 1)
                    .isEqualTo(200);
        }
    }

    @Test
    @DisplayName("The budget covers every route the reference opens")
    void oneCapabilityOneBudget() {
        String mine = book();
        for (int i = 0; i < BUDGET; i++) {
            get(guess(i));
        }

        // Cancelling, moving and reporting are the same capability being spent,
        // so a limit on the read alone would leave the guesser three doors.
        given().contentType("application/json").body("{}")
                .when().post("/v1/bookings/" + mine + "/cancellation")
                .then().statusCode(429);
        given().contentType("application/json")
                .body("{\"starts_at\":\"2026-09-05T14:00:00Z\"}")
                .when().post("/v1/bookings/" + mine + "/reschedule")
                .then().statusCode(429);
        given().contentType("application/json").body("{\"reason\":\"OTHER\"}")
                .when().post("/v1/bookings/" + mine + "/report")
                .then().statusCode(429);
    }

    @Test
    @DisplayName("A reference said down a telephone still opens the booking")
    void itSurvivesBeingDictated() {
        String mine = book();

        assertThat(mine).matches("^[A-Z]{3}-[2-9A-HJKMNP-Z]{6}$");
        assertThat(mine).startsWith("SFA-");

        // The three ways a person writes down what they were told. None of them
        // may cost the customer a try, either - each of these is a hit.
        assertThat(get(mine.toLowerCase(java.util.Locale.ROOT))).isEqualTo(200);
        assertThat(get(mine.replace("-", ""))).isEqualTo(200);
        assertThat(get(mine.replace("-", "").toLowerCase(java.util.Locale.ROOT))).isEqualTo(200);

        // The report route resolves the reference inside a database function of
        // its own, so it is the one that would drift if the edge stopped
        // canonicalising what it was given.
        given().contentType("application/json").body("{\"reason\":\"OTHER\"}")
                .when().post("/v1/bookings/" + mine.toLowerCase(java.util.Locale.ROOT) + "/report")
                .then().statusCode(202);
    }
}
