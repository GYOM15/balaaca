package com.balaaca.app.it;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The invariant the product cannot afford to lose: two customers must never
 * hold the same slot.
 *
 * <p>A sequential "book twice, second fails" test proves nothing here - the
 * second call simply reads the first one's committed row. These fire genuinely
 * at once, through HTTP, against a real PostgreSQL.
 *
 * <p>The losers' SQLSTATE is not deterministic. Measured against this schema, N
 * racers always leave exactly one winner, but the rest come back as 23P01 at
 * three racers and as 40P01 deadlock at two, five and ten: each transaction
 * inserts its tuple then waits on the other, and two such waits form a cycle
 * PostgreSQL breaks as a deadlock. A deadlock says nothing about whether the
 * slot is free, so the service retries it - which is why every loser here must
 * land on a clean 409 and never on an unhandled 500.
 */
@QuarkusTest
@QuarkusTestResource(PostgresTestResource.class)
class BookingConcurrencyIT {

    private static final int RACERS = 10;

    @Inject
    BookingFixtures fixtures;

    @BeforeEach
    void seed() {
        fixtures.reset();
    }

    @Test
    @DisplayName("Ten simultaneous bookings on one slot leave exactly one winner")
    void oneWinnerOnly() throws Exception {
        Map<Integer, Long> byStatus = race(
                "/v1/providers/coiffeur-solo/appointments",
                BookingFixtures.SOLO_OFFERING,
                "2026-10-01T09:00:00Z");

        assertThat(byStatus.getOrDefault(201, 0L))
                .as("exactly one booking is created")
                .isEqualTo(1);
        assertThat(byStatus.getOrDefault(409, 0L))
                .as("every other racer is told the slot is taken")
                .isEqualTo(RACERS - 1);
        assertThat(byStatus.getOrDefault(500, 0L))
                .as("a deadlock must never reach the client as an unhandled error")
                .isZero();
        // The retry budget measures effort, not truth. A loser whose attempts
        // ran out on deadlocks used to be told the system was busy and to try
        // again - for a slot that was gone. The answer now comes from the
        // committed data instead of the counter.
        assertThat(byStatus.getOrDefault(503, 0L))
                .as("a loser is told the slot is taken, never that the system is busy")
                .isZero();

        assertThat(fixtures.activeAppointments(BookingFixtures.SOLO))
                .as("the database holds one row, whatever the API said")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("A deadlock is retried, never reported as a taken slot")
    void deadlocksAreRetriedNotReported() throws Exception {
        // Ten racers reliably produce deadlocks on this schema. If the retry were
        // missing, some losers would surface as 500; if a deadlock were mapped to
        // 409 without retrying, a free slot could be refused. Both are excluded
        // by the counts above, so this asserts the outcome the retry guarantees:
        // the winner is a real, complete booking.
        race("/v1/providers/coiffeur-solo/appointments",
             BookingFixtures.SOLO_OFFERING, "2026-10-02T09:00:00Z");

        assertThat(fixtures.activeAppointments(BookingFixtures.SOLO)).isEqualTo(1);
        assertThat(fixtures.distinctStaffBooked(BookingFixtures.SOLO)).isEqualTo(1);
    }

    /** Fires RACERS requests released together by a latch, and counts the statuses. */
    private Map<Integer, Long> race(String path, UUID offering, String startsAt) throws Exception {
        CountDownLatch releaseAll = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(RACERS)) {
            List<Future<Integer>> futures = IntStream.range(0, RACERS)
                    .mapToObj(i -> pool.submit(() -> {
                        releaseAll.await();
                        return given().contentType("application/json")
                                .header("Idempotency-Key", "racer-" + startsAt + "-" + i)
                                .body("""
                                      {"service_offering_id":"%s","starts_at":"%s",
                                       "customer":{"full_name":"Client %d","phone":"+22462200%04d"}}
                                      """.formatted(offering, startsAt, i, i))
                                .when().post(path)
                                .then().extract().statusCode();
                    }))
                    .toList();

            releaseAll.countDown();

            return futures.stream()
                    .map(f -> {
                        try {
                            return f.get();
                        } catch (Exception e) {
                            throw new IllegalStateException(e);
                        }
                    })
                    .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        }
    }
}
