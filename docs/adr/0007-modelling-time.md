# ADR-0007 - Instants in UTC, recurring rules in local time

Status: Accepted

## Context

A booking product handles two kinds of time that everything confuses: an
appointment is an **instant** on the timeline, whereas "Monday from 9 to 18" is a
**local time** that only means anything against a timezone.

Guinea is at UTC+0 with no daylight saving. That is a trap: the code can be wrong
and every local test still pass.

## Decision

| Concept | Java type | SQL type |
|---|---|---|
| Start / end of an appointment | `Instant` | `timestamptz` |
| Blocked range | `Instant` | generated `tstzrange` |
| Recurring weekly opening hours | `LocalTime` + `DayOfWeek` | `time` + `smallint` |
| Calendar override | `LocalDate` | `date` |
| The provider's timezone | `ZoneId` | IANA `varchar(64)` |

The rule: **an instant for what happens once, a local time plus the provider's
timezone for what recurs.** The conversion happens in one place,
`shared-kernel`.

A `java.time.Clock` is injected everywhere. Forbidden: `Instant.now()` or
`LocalDateTime.now()` called directly in business code, and any date handled as a
`String`.

`providers.timezone` defaults to `Africa/Conakry` but is never assumed: the
product is aimed at other markets too.

Slot calculation is a **pure function**: rules, overrides, existing appointments,
the service offering's duration and buffers, the policy, the range, the timezone
and the current instant in; a list of slots out. No JPA dependency, no network
access, and so exhaustively testable.

What the frontend displays is only a suggestion: the slot is **recomputed on the
server** at booking time, from the service offering's duration. Any duration or
end time sent by the client is ignored.

## Consequences

Positive: a provider can change timezone without rewriting their past
appointments. Moving into another country needs no schema change. Slot
calculation can be tested without a database.

Negative: two representations coexist, and confusing them is the easiest mistake
to make. The conversion has to stay centralised, or it will scatter.

**A test consequence, not negotiable**: because UTC+0 with no daylight saving
hides bugs, the slot calculator's property tests run **also** under a timezone
that changes clocks, `Europe/Paris`. The mandatory edge cases are: a closed day,
a break between two segments, an override of each kind, a service offering longer
than the remaining window, the minimum notice, the maximum horizon, a slot
straddling midnight, and a daylight saving transition.

## Revisit when

A provider has to exist in several timezones at once, or a staff member works in
a timezone different from their provider's.
