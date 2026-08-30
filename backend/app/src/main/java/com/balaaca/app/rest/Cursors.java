package com.balaaca.app.rest;

import com.balaaca.app.api.model.ErrorCode;
import com.balaaca.booking.ports.inbound.ListAppointmentsUseCase.AgendaPosition;
import com.balaaca.providers.ports.inbound.SearchProvidersUseCase.Position;
import com.balaaca.sharedkernel.error.DomainException;
import com.balaaca.sharedkernel.ids.AppointmentId;
import com.balaaca.sharedkernel.ids.ServiceOfferingId;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The opaque position in a paged collection.
 *
 * <p>Opaque to the client, and deliberately so: a cursor a client can construct
 * is a cursor a client will construct, and then its encoding is part of the
 * contract for ever. What it holds here is the next entry's own start instant,
 * which the caller already read in the previous page.
 */
final class Cursors {


    static final int DEFAULT_LIMIT = 50;

    private Cursors() {
    }

    /**
     * The agenda's position is two values, because one is not enough: two
     * appointments can start at the same instant, and a cursor that could not
     * tell them apart would drop one or repeat it at every page boundary.
     */
    static String encodeAgenda(AgendaPosition position) {
        return encodeRaw(position.startsAt() + "|" + position.id().value());
    }

    static Optional<AgendaPosition> agendaPosition(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return Optional.empty();
        }
        String[] parts = decodeRaw(cursor).split("\\|", 2);
        if (parts.length != 2) {
            throw new InvalidCursorException();
        }
        try {
            return Optional.of(new AgendaPosition(Instant.parse(parts[0]),
                                                  AppointmentId.of(UUID.fromString(parts[1]))));
        } catch (IllegalArgumentException | java.time.format.DateTimeParseException e) {
            throw new InvalidCursorException();
        }
    }

    /**
     * The directory's position: a name and a slug. Two values for the same
     * reason the agenda's is - two salons can be called Chez Fatou, and a cursor
     * that could not tell them apart would drop one or repeat it at every page
     * boundary.
     *
     * <p>A slug rather than the row id, because this cursor is handed to an
     * unauthenticated caller on every page. The name is escaped: a business name
     * may contain the separator, and a salon called "A | B" must not be able to
     * forge a position.
     */
    static String encodeDirectory(Position position) {
        return encodeRaw(position.businessName().replace("\\", "\\\\").replace("|", "\\|")
                         + "|" + position.slug());
    }

    static Optional<Position> directoryPosition(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return Optional.empty();
        }
        String raw = decodeRaw(cursor);
        int split = lastUnescapedBar(raw);
        if (split < 0) {
            throw new InvalidCursorException();
        }
        String slug = raw.substring(split + 1);
        if (slug.isBlank()) {
            throw new InvalidCursorException();
        }
        return Optional.of(new Position(
                raw.substring(0, split).replace("\\|", "|").replace("\\\\", "\\"), slug));
    }

    private static int lastUnescapedBar(String raw) {
        for (int i = raw.length() - 1; i >= 0; i--) {
            if (raw.charAt(i) != '|') {
                continue;
            }
            int backslashes = 0;
            for (int j = i - 1; j >= 0 && raw.charAt(j) == '\\'; j--) {
                backslashes++;
            }
            if (backslashes % 2 == 0) {
                return i;
            }
        }
        return -1;
    }

    /** A bare identifier, for a sequence the provider orders itself. */
    static String encodeRawId(UUID id) {
        return encodeRaw(id.toString());
    }

    static Optional<ServiceOfferingId> serviceOfferingPosition(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(ServiceOfferingId.of(UUID.fromString(decodeRaw(cursor))));
        } catch (IllegalArgumentException e) {
            throw new InvalidCursorException();
        }
    }

    static String encode(Instant position) {
        return encodeRaw(position.toString());
    }

    private static String encodeRaw(String raw) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private static String decodeRaw(String cursor) {
        try {
            return new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw new InvalidCursorException();
        }
    }

    /** Everything at or after the cursor, or everything when there is none. */
    static List<com.balaaca.scheduling.domain.AvailableSlot> after(
            List<com.balaaca.scheduling.domain.AvailableSlot> all, String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return all;
        }
        Instant from = decode(cursor);
        return all.stream().filter(s -> !s.startsAt().isBefore(from)).toList();
    }

    private static Instant decode(String cursor) {
        try {
            return Instant.parse(decodeRaw(cursor));
        } catch (java.time.format.DateTimeParseException e) {
            // A cursor the server did not mint. Answered as a malformed
            // parameter, which is what it is, rather than as a 500.
            throw new InvalidCursorException();
        }
    }

    static final class InvalidCursorException extends DomainException {
        InvalidCursorException() {
            super(ErrorCode.VALIDATION_FAILED.toString(), 400, "The cursor is not valid", Map.of());
        }
    }
}
