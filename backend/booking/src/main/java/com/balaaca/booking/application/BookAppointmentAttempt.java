package com.balaaca.booking.application;

import com.balaaca.booking.domain.BookedSlot;
import com.balaaca.booking.domain.BookingExceptions.CustomerBlockedException;
import com.balaaca.booking.domain.BookingExceptions.FulfilmentNotChosenException;
import com.balaaca.booking.domain.BookingExceptions.FulfilmentNotOfferedException;
import com.balaaca.booking.domain.BookingExceptions.ServiceAddressMismatchException;
import com.balaaca.booking.domain.BookingExceptions.UnknownServiceLocalityException;
import com.balaaca.booking.domain.ServiceAddress;
import com.balaaca.catalog.ports.inbound.Fulfilment;
import com.balaaca.providers.ports.inbound.ListLocalitiesUseCase;
import com.balaaca.booking.domain.BookingExceptions.NoEligibleStaffException;
import com.balaaca.booking.ports.inbound.BookAppointmentUseCase.BookAppointmentCommand;
import com.balaaca.booking.ports.outbound.AppointmentRepository;
import com.balaaca.booking.ports.outbound.AppointmentRepository.InsertOutcome;
import com.balaaca.booking.ports.outbound.AppointmentRepository.NewAppointment;
import com.balaaca.catalog.ports.inbound.BookableOffering;
import com.balaaca.catalog.ports.inbound.LookupServiceOfferingUseCase;
import com.balaaca.booking.domain.BookingExceptions.StaffCannotPerformServiceException;
import com.balaaca.booking.domain.BookingExceptions.UnknownStaffException;
import com.balaaca.booking.domain.BookingExceptions.SlotOutsideAvailabilityException;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase;
import com.balaaca.scheduling.ports.inbound.CalculateSlotsUseCase.SlotRequest;
import java.time.LocalDate;
import java.time.ZoneId;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.CustomerId;
import com.balaaca.sharedkernel.ids.StaffId;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * One booking attempt, in its own transaction.
 *
 * <p>Separate from {@link BookAppointmentService} because a retry needs a fresh
 * transaction: once a statement fails, the current one is rollback-only and
 * nothing further can run in it.
 */
@ApplicationScoped
public class BookAppointmentAttempt {

    private final LookupServiceOfferingUseCase offerings;
    private final CalculateSlotsUseCase slots;
    private final AppointmentRepository appointments;
    private final ListLocalitiesUseCase localities;
    private final BookingNotifications notifications;

    public BookAppointmentAttempt(LookupServiceOfferingUseCase offerings,
                                  CalculateSlotsUseCase slots,
                                  AppointmentRepository appointments,
                                  ListLocalitiesUseCase localities,
                                  BookingNotifications notifications) {
        this.offerings = offerings;
        this.slots = slots;
        this.appointments = appointments;
        this.localities = localities;
        this.notifications = notifications;
    }

    /**
     * @param excluded staff already found booked in an earlier attempt, skipped
     *                 so the loop makes progress instead of retrying the same
     *                 candidate
     */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public InsertOutcome once(BookAppointmentCommand command, List<StaffId> excluded) {
        BookableOffering offering = offerings.requireBookable(command.serviceOfferingId());
        // The application layer, not the domain, is where the two contexts meet.
        BookedSlot slot = BookedSlot.from(command.startsAt(), offering.duration(),
                                          offering.bufferBefore(), offering.bufferAfter());

        // A retry is not a new request and must not be judged as one. Answered
        // first, before any rule is applied: the slot it took may since have
        // fallen inside the lead time or been closed by an override, and
        // refusing the retry would leave the caller believing nothing was
        // booked while the appointment stands. Only a request carrying a key
        // can be a retry, so this reads on exactly those.
        Optional<InsertOutcome> replay = command.idempotency()
                .flatMap(i -> appointments.replayOf(i.key(), i.requestHash()));
        if (replay.isPresent()) {
            return replay.get();
        }

        // Before anything is computed about the slot, and before the customer
        // row is touched. Asked of the page and not of the counter: a provider
        // entering the same person at the till has settled it with them, and
        // their own refusal is not something to enforce against them.
        //
        // Ahead of every rule below on purpose. Each of those answers something
        // about the diary - what is open, who is free, which modes are offered -
        // and a caller this provider will not serve has no business being told
        // any of it.
        //
        // After the replay check, though, and for the same reason availability
        // is: a retry is not a new request. A booking that was accepted before
        // the provider blocked the number stands, and its retry must be handed
        // the appointment rather than a refusal that leaves the caller believing
        // nothing was booked.
        if (command.source().honoursCustomerBlocking()
                && appointments.isBlocked(command.customer().phone())) {
            throw new CustomerBlockedException();
        }

        // Checked inside the transaction, against the same calculation that
        // produced the public list. The exclusion constraint stops a slot being
        // sold twice; nothing else stops one being sold at 3am on a closed day.
        // The two questions stay separate: this one never asks whether the slot
        // is free, so a taken slot still answers 409 and not 422.
        //
        // Asked of a customer and not of the provider. What was published is
        // what a stranger may take; a provider writing into their own diary is
        // recording something that is happening, and the enum says which
        // sources are which.
        if (command.source().honoursPublishedAvailability()
                && !slots.isWithinAvailability(command.startsAt(),
                                               slotRequest(command, offering))) {
            throw new SlotOutsideAvailabilityException(command.startsAt(),
                    "outside the provider's declared availability");
        }

        // After the replay check, for the same reason as availability: a retry
        // is not a new request and must not be judged as one.
        Fulfilment fulfilment = chosenFrom(command, offering);
        Optional<ServiceAddress> address = addressFor(command, fulfilment);

        StaffId staffId = command.staffId().orElseGet(() -> pick(command, excluded));

        // The server's own pick came off a list that already joins competence
        // and standing. A name the CLIENT chose did not, so both are checked
        // here - once, in the transaction that books it.
        if (command.staffId().isPresent()) {
            // Whether the chair still exists comes first: somebody who has left
            // is not "unable to perform this service", they are not there. A
            // 404 also says nothing about who works where, which is the same
            // reason the reschedule route answers 404 for a stranger's staff id.
            if (!appointments.canBeAssigned(
                    staffId, command.source().honoursPublishedAvailability())) {
                throw new UnknownStaffException(staffId.value());
            }
            if (!appointments.performs(staffId, command.serviceOfferingId())) {
                throw new StaffCannotPerformServiceException(
                        staffId.value(), command.serviceOfferingId().value());
            }
        }
        CustomerId customerId = appointments.upsertCustomer(command.customer());

        InsertOutcome outcome = appointments.insertIfAbsent(new NewAppointment(
                AppointmentId.of(UUID.randomUUID()),
                staffId,
                offering,
                slot,
                customerId,
                fulfilment,
                address,
                command.source(),
                command.preferredChannel(),
                command.customerNote(),
                command.idempotency().map(i -> i.key()),
                command.idempotency().map(i -> i.requestHash())));

        // In this transaction, after the appointment exists: the notifications
        // carry a foreign key to it, and committing them separately would be the
        // dual write the outbox exists to avoid. Not on a replay - the rows are
        // already there, and their dedupe keys would absorb them anyway.
        if (!outcome.replayed()) {
            notifications.planFor(outcome.appointmentId(), outcome.reference(),
                                  command.startsAt(), offering, command.customer(),
                                  command.preferredChannel());
        }
        return outcome;
    }

    /**
     * Candidates the caller has not already found booked.
     *
     * <p>Transactional even though it only reads: the RLS session variable is
     * set with {@code is_local = true}, so outside a transaction it lasts one
     * statement and the following SELECT runs with no tenant bound - returning
     * zero staff, and turning every server-chosen booking into a spurious
     * "no eligible staff". Verified against the database, not assumed.
     */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public List<StaffId> candidates(BookAppointmentCommand command) {
        // The offering is resolved BEFORE eligibility, and the order is the
        // whole point. Since competence is strict, a service that is not this
        // provider's joins to nobody - so an id belonging to another salon
        // produced an empty candidate list and answered 409 "that slot is gone"
        // for a service that does not exist here. The contract promises 404 for
        // an unknown offering, and this read is what still gives it.
        offerings.requireBookable(command.serviceOfferingId());

        return command.staffId()
                .map(List::of)
                .orElseGet(() -> appointments.eligibleStaff(command.serviceOfferingId()));
    }

    /**
     * Whether the committed data already accounts for every chair in this
     * window.
     *
     * <p>Asked only once the loop has given up. The retry budget measures how
     * hard this request tried, not what the answer is, and the two are not the
     * same thing: N racers on one slot leave one winner and N-1 losers whose
     * SQLSTATE happened to be a deadlock, and reporting congestion to all of
     * them tells a customer to wait for a chair that will never open.
     */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public boolean everyChairIsTaken(BookAppointmentCommand command) {
        BookableOffering offering = offerings.requireBookable(command.serviceOfferingId());
        BookedSlot slot = BookedSlot.from(command.startsAt(), offering.duration(),
                                          offering.bufferBefore(), offering.bufferAfter());
        return appointments.freeStaffCount(command.serviceOfferingId(), command.staffId(),
                slot.blockedFrom(), slot.blockedUntil()) == 0;
    }

    /**
     * Which of the published modes this booking is, resolved before anything is
     * decided from it.
     *
     * <p>Not defaulted when the service publishes several: the two answers are
     * a customer sitting in a salon and a stranger arriving at their house, and
     * a server that guesses between them gets one of the two wrong.
     */
    private static Fulfilment chosenFrom(BookAppointmentCommand command,
                                         BookableOffering offering) {
        Set<Fulfilment> offered = offering.fulfilments();
        Optional<Fulfilment> chosen = command.fulfilment();

        if (chosen.isEmpty()) {
            if (offered.size() != 1) {
                throw new FulfilmentNotChosenException(names(offered));
            }
            return offered.iterator().next();
        }
        if (!offered.contains(chosen.get())) {
            throw new FulfilmentNotOfferedException(chosen.get().name(), names(offered));
        }
        return chosen.get();
    }

    private static List<String> names(Set<Fulfilment> offered) {
        return offered.stream().map(Fulfilment::name).sorted().toList();
    }

    /**
     * The address, checked against what was CHOSEN rather than against what the
     * client sent.
     *
     * <p>Against the choice and no longer against the service: one that
     * publishes both shapes needs an address for this booking and must not hold
     * one for the next.
     *
     * <p>Both directions are refused. A call-out with no directions is a job
     * nobody can do; a shop appointment carrying an address is a customer's home
     * address stored for no reason, which is how a directory turns into a list
     * of where its customers live.
     */
    private Optional<ServiceAddress> addressFor(BookAppointmentCommand command,
                                                Fulfilment fulfilment) {
        boolean callOut = fulfilment == Fulfilment.AT_CUSTOMER;
        if (callOut != command.serviceAddress().isPresent()) {
            throw new ServiceAddressMismatchException(callOut);
        }
        return command.serviceAddress().map(this::canonicalise);
    }

    /**
     * The commune as the map spells it, or a refusal.
     *
     * <p>Resolved through providers' own port rather than read from here: the
     * table belongs to that module, and a slug stored without being checked is
     * a filter nobody can select and a value nobody is told is wrong.
     */
    private ServiceAddress canonicalise(ServiceAddress address) {
        return new ServiceAddress(
                address.localitySlug().map(slug -> localities.canonicalSlug(slug)
                        .orElseThrow(() -> new UnknownServiceLocalityException(slug))),
                address.area().map(String::trim).filter(a -> !a.isEmpty()),
                address.directions());
    }

    private static SlotRequest slotRequest(BookAppointmentCommand command,
                                           BookableOffering offering) {
        // A single day: the question is whether this one start is bookable, and
        // widening the range would only cost work.
        LocalDate day = command.startsAt().atZone(ZoneId.of("UTC")).toLocalDate();
        return new SlotRequest(command.serviceOfferingId(), command.staffId(),
                day.minusDays(1), day.plusDays(1),
                offering.duration(), offering.bufferBefore(), offering.bufferAfter());
    }

    private StaffId pick(BookAppointmentCommand command, List<StaffId> excluded) {
        return appointments.eligibleStaff(command.serviceOfferingId()).stream()
                .filter(id -> !excluded.contains(id))
                .findFirst()
                .orElseThrow(() -> new NoEligibleStaffException(command.startsAt()));
    }
}
