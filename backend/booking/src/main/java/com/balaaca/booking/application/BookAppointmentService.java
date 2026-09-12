package com.balaaca.booking.application;

import com.balaaca.booking.domain.BookingExceptions.BookingContendedException;
import com.balaaca.booking.domain.BookingExceptions.NoEligibleStaffException;
import com.balaaca.booking.domain.BookingExceptions.SlotUnavailableException;
import com.balaaca.booking.domain.BookingExceptions.TransientBookingConflictException;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase;
import com.balaaca.booking.ports.outbound.AppointmentRepository.InsertOutcome;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.ArrayList;
import java.util.List;
import com.balaaca.sharedkernel.ids.StaffId;

/**
 * Books an appointment, handling the two ways the database says "you lost".
 *
 * <p>Not transactional itself: a retry needs a new transaction, and this one
 * would already be rollback-only. Each attempt opens its own.
 *
 * <p>Measured against the real schema, N sessions racing for one slot always
 * leave exactly one winner, but the losers' SQLSTATE varies with contention:
 * 23P01 at three racers, 40P01 deadlock at two, five and ten. Both mean "lost",
 * but only one of them means "the slot is taken":
 *
 * <ul>
 *   <li>23P01 - that staff member is genuinely booked. With a client-named
 *       staff member that is the answer; with a server-chosen one, try the next
 *       colleague rather than turning a customer away from a free chair.
 *   <li>40P01 - PostgreSQL broke a wait cycle. It says nothing about the slot,
 *       so the same attempt is simply retried.
 * </ul>
 */
@ApplicationScoped
public class BookAppointmentService implements BookAppointmentUseCase {

    /** Enough to clear a deadlock storm; beyond it the system, not the slot, is the problem. */
    private static final int MAX_DEADLOCK_RETRIES = 3;

    private final BookAppointmentAttempt attempt;

    public BookAppointmentService(BookAppointmentAttempt attempt) {
        this.attempt = attempt;
    }

    @Override
    public BookingResult book(BookAppointmentCommand command) {
        boolean staffNamedByClient = command.staffId().isPresent();
        List<StaffId> tried = new ArrayList<>();
        int candidateCount = staffNamedByClient ? 1 : attempt.candidates(command).size();
        if (candidateCount == 0) {
            throw new NoEligibleStaffException(command.startsAt());
        }

        int deadlocks = 0;
        // One pass per candidate, plus the retries a deadlock storm may need.
        int budget = candidateCount + MAX_DEADLOCK_RETRIES;

        for (int i = 0; i < budget; i++) {
            try {
                InsertOutcome outcome = attempt.once(command, tried);
                return new BookingResult(outcome.appointmentId(), outcome.reference(),
                                         outcome.status(), outcome.replayed());

            } catch (TransientBookingConflictException e) {
                if (++deadlocks > MAX_DEADLOCK_RETRIES) {
                    throw exhausted(command);
                }

            } catch (SlotUnavailableException e) {
                // A client who named a staff member asked about that person, and
                // that person is busy. Silently moving them to a colleague would
                // book them with someone they did not choose.
                if (staffNamedByClient) {
                    throw e;
                }
                StaffId busy = busyStaff(e);
                if (busy == null || tried.contains(busy)) {
                    throw e;
                }
                tried.add(busy);
                if (tried.size() >= candidateCount) {
                    throw e;
                }
            }
        }
        throw exhausted(command);
    }

    /**
     * How long to keep asking the database before answering "busy".
     *
     * <p>Ten racers on one slot exhaust the deadlock budget in under a
     * millisecond, and the winner's COMMIT is not instant. A read taken the
     * moment the budget runs out therefore sees a free chair and says the
     * system is congested - which is the one answer this class exists to
     * avoid, because it sends a customer back to a slot that is gone. It is
     * not a hypothetical: it is what ten racers produced on a loaded CI runner
     * while passing on a fast machine, and the test that caught it was right.
     *
     * <p>Bounded rather than closed. Nothing can distinguish "another
     * transaction is inserting and will commit" from "and will roll back"
     * without waiting for it, so this waits, briefly, and then answers
     * honestly. Three reads over sixty milliseconds cost nothing on the path
     * where they run - a request that has already lost every attempt it had.
     */
    private static final int TRUTH_READS = 3;
    private static final long TRUTH_PAUSE_MS = 20;

    /**
     * What to tell a caller whose attempts are spent.
     *
     * <p>Not the counter's answer, the database's. A deadlock says this
     * transaction lost, never why; and on this schema a storm of them is
     * exactly what N racers on one slot produce. Reporting congestion to every
     * loser sends a customer back to a slot that is gone.
     *
     * <p>Read more than once, because the winner may still be committing. The
     * first read is immediate: on the common path - one racer, a slot genuinely
     * free, a transient fault - it answers without waiting at all.
     */
    private RuntimeException exhausted(BookAppointmentCommand command) {
        for (int read = 0; read < TRUTH_READS; read++) {
            if (attempt.everyChairIsTaken(command)) {
                return new SlotUnavailableException(command.startsAt());
            }
            if (read < TRUTH_READS - 1) {
                pause();
            }
        }
        return new BookingContendedException(command.startsAt());
    }

    /** Interruption is not swallowed: the flag is restored and the wait ends. */
    private static void pause() {
        try {
            Thread.sleep(TRUTH_PAUSE_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Which staff member the database refused. Carried in the exception's audit
     * details rather than its message, so the retry can skip that candidate
     * without the client ever learning who is busy.
     */
    private static StaffId busyStaff(SlotUnavailableException e) {
        Object raw = e.details().get("staff_id");
        return raw == null || "null".equals(raw.toString())
                ? null
                : StaffId.of(java.util.UUID.fromString(raw.toString()));
    }
}
