# ADR-0001 - A hexagonal modular monolith rather than microservices

Status: Accepted

## Context

Balaaca is a hub of providers. One booking touches, in a single business
gesture, the provider, the service offering, the availability, the customer
book, the appointment itself and the notifications to schedule. The team is
small. The deployment target is a VPS.

Splitting into microservices would impose a distributed transaction where a
single ACID transaction is enough, for no benefit at this scale.

## Decision

A **hexagonal modular monolith**, one Maven module per bounded context:

`shared-kernel`, `identity`, `providers`, `catalog`, `scheduling`, `booking`,
`billing`.

Each context is split into four layers, dependencies pointing inwards:
`domain/` (framework free), `ports/{inbound,outbound}`, `application/`,
`adapters/{inbound,outbound}`.

A context talks to another by an **in-process Java call** through its inbound
port. There is **neither gRPC nor a `.proto` file** in this project.

Two components are deployed separately because their execution profile differs:
`notification-worker` (asynchronous, slow network I/O) and `chatbot-service`
(a skeleton).

The Maven module is the means: it makes a boundary violation impossible at
compile time, not merely detectable in review. ArchUnit covers the rest.

## Consequences

Positive: a booking stays a single ACID transaction. One artifact to deploy, to
monitor and to roll back. Refactoring across contexts stays a compiler
refactoring.

Negative: boundary discipline rests on the Maven modules and on ArchUnit, never
on goodwill. The build is slower than a single module would be. A badly split
context is paid for with a dependency cycle the build will refuse.

## Revisit when

A named driver appears for extracting a context: independent scaling, failure
isolation, a separate deployment cadence, ownership by another team, a
technology the monolith cannot host, or a regulatory boundary. "It is cleaner"
is not one.

Extraction moves the **deployment** boundary; the business boundary (the port)
does not move. That is what makes extraction cheap later and unnecessary today.
