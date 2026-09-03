---
name: domain-boundaries
description: Keeps primitives out of the core and puts translation at the edge. Use when adding a field to a command, DTO or port signature, when introducing an identifier or any value with a format, when deciding whether a conversion deserves a mapper class, or when reviewing a PR that passes a raw UUID, a String phone number, a String status, or re-validates in an application service something the edge should already have proven.
---

# domain-boundaries

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

The core speaks domain types. An adapter converts once, at the edge, and
everything inward is valid by construction. That property is what lets an
application service carry no defensive checks - not discipline, structure.

## When to use

- Adding a field to a command, a port signature, or a REST DTO.
- Introducing an identifier, or any value with a format: a phone number, a
  slug, a currency code, a status.
- Deciding whether a conversion deserves a mapper class or belongs inline.
- Reviewing a PR that passes a raw `UUID`, a `String` phone number or a
  `String` status across a port.

## The rules

1. **Identifiers are distinct types, never raw `UUID`.**
   `ServiceOfferingId`, `StaffId`, `CustomerId`, `AppointmentId` in
   `com.balaaca.sharedkernel.ids`, each a record implementing `EntityId`.
   Four raw uuids in one method signature is four chances to transpose two of
   them, and the compiler cannot help. Typed, passing a customer id where a
   staff id belongs stops being a runtime mystery and becomes a compile error.
   Retyping the booking path this way immediately showed every place a bare
   uuid was crossing a boundary.

2. **A value with a format is a type, not a `String`.** A phone number is a
   `PhoneNumber`, parsed and normalised to E.164. Money is a `Money`. A
   closed set of values is an enum: `BookingSource`, not `"PUBLIC"` - the
   database already constrains that column to four values, and a typo should
   be a compile error rather than a `CHECK` violation surfacing as a 500.

3. **Parse at the edge, exactly once.** The inbound adapter turns what a client
   sent into domain objects. Nothing inward re-checks whether a phone number is
   normalised, because a `PhoneNumber` that exists is normalised. An application
   service that validates its own inputs is a sign the boundary leaked.

4. **Never flatten a type you just built.** Parsing a `PhoneNumber` at the edge
   and then passing `phone.e164()` as a `String` into the core throws away the
   only proof that it is valid, at the precise moment it would have been worth
   keeping. The command carries the `PhoneNumber`; the persistence adapter
   unwraps it, because that is the edge on the other side.

5. **A mapper class earns its place by RULES, not by field count.** This is the
   nuance that matters:

   | The translation | Where it belongs |
   |---|---|
   | Copies one field out (`AppointmentId` into a response) | inline at the call site |
   | Parses, normalises, defaults, converts a unit or an enum | a named mapper |
   | Copies twelve fields one-to-one | neither - ask why two identical shapes exist |

   `CustomerContact` has three fields and deserves a mapper, not because of
   three but because the conversion *decides* three things that can be wrong: it
   parses the phone against a region, trims the name, and turns a blank email
   into `Optional.empty()`. Three rules, three things to test.

6. **A second test outweighs size: how many inbound adapters need the same
   translation?** REST, the chatbot and the dashboard will all have to produce a
   `BookAppointmentCommand`. Inlined in the first resource, the second copies it
   and the third gets the phone region wrong. One caller today and three
   tomorrow is still a mapper.

7. **A mapper is a plain bean or a static function, never a framework artefact.**
   It must be unit-testable with no container. `RequestFingerprint` is a static
   utility precisely because it is a pure function with no collaborators -
   making it a CDI bean for consistency's sake would be ceremony.

8. **The domain does not depend on the framework, and does not depend on another
   context.** A `domain/` package imports nothing but itself and
   `shared-kernel`. Check it by grepping the imports; it takes thirty seconds
   and it caught a real leak here (see `backend-architecture`).

## Anti-patterns

- `book(UUID offeringId, UUID staffId, UUID customerId)` -> rule 1; three
  interchangeable parameters and no compiler help when two are swapped.
- `PhoneNumber.parse(raw, region).e164()` handed to the core as a `String`
  -> rule 4; the type existed for one line and was discarded.
- `String source = "PUBLIC"` against a column with a four-value `CHECK`
  -> rule 2; a typo becomes a 500 instead of a compile error.
- An application service that re-validates a phone number it was given
  -> rule 3; either the edge did not parse, or the check is dead code.
- A `FooMapper` bean that copies two fields verbatim -> rule 5; inline it.
- A mapper inlined in a resource "because there is only one caller today"
  -> rule 6; count the adapters that will exist, not the ones that do.
- A domain record whose factory takes another context's port DTO -> rule 8.

## Minimal correct example

The command speaks domain types, and carries no tenant - that is ambient:

```java
public record BookAppointmentCommand(
        ServiceOfferingId serviceOfferingId,
        Optional<StaffId>  staffId,       // empty: the server chooses
        Instant            startsAt,
        CustomerContact    customer,      // holds a parsed PhoneNumber
        Optional<Idempotency> idempotency,
        BookingSource      source) {}
```

The adapter is the only place invalid becomes valid:

```java
@ApplicationScoped
public class BookAppointmentRequestMapper {

    public BookAppointmentCommand toCommand(BookAppointmentRequest request,
                                            String idempotencyKey,
                                            String defaultRegion,
                                            BookingSource source) {
        return new BookAppointmentCommand(
                ServiceOfferingId.of(request.serviceOfferingId()),
                Optional.ofNullable(request.staffId()).map(StaffId::of),
                request.startsAt(),
                new CustomerContact(
                        request.customer().fullName().trim(),
                        // The region comes from the provider's country. A
                        // hardcoded prefix would have to be undone by the first
                        // provider in another market.
                        PhoneNumber.parse(request.customer().phone(), defaultRegion),
                        Optional.ofNullable(request.customer().email()).filter(e -> !e.isBlank())),
                toIdempotency(idempotencyKey, request),
                source);
    }
}
```

And the resource does nothing but bind the tenant and delegate - no parsing, no
decisions, no `try/catch`:

```java
tenants.bindPublished(slug);
try {
    var result = booking.book(mapper.toCommand(request, key, "GN", BookingSource.PUBLIC));
    return Response.status(result.replayed() ? 200 : 201)
            .entity(new AppointmentCreatedResponse(result.appointmentId().value()))
            .build();
} finally {
    tenants.clear();
}
```

Note the response mapping is inline: one field, no rules, no mapper (rule 5).

## Sibling skills

- `backend-architecture` - the layer and cross-context rules this refines.
- `backend-naming` - what the types are called once they exist.
- `backend-exceptions` - where a failed parse becomes an RFC 7807 response.
- `money-currency` - `Money` and `PhoneNumber`, the two typed values that
  already exist.
- `contract-first` - the wire shape the adapter converts from.
- `backend-tests` - a mapper is unit-testable without a container; that is a
  reason to have one.
