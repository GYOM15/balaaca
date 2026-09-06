---
name: code-language
description: Use when naming anything the machine reads - class, method, package, file, DB table or column, Flyway migration, REST route slug, OpenAPI schema, event or log event name, metric, span, config key, environment variable - when writing a user-facing string or a notification template key, or when reviewing a PR that mixes French and English.
---

# code-language

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Strict rule: everything the machine and the developer read is **English**;
everything the customer reads is **French first** for the launch market, keyed
in English, with English and local languages planned. Both directions, no
drift.

## When to use

- Writing any new code: class, method, package, variable, file name, code
  comment, Javadoc, log event name, exception/`ProblemDetail` message, metric
  name, span name, config key, environment variable.
- Modelling the domain: aggregate, entity, value object, port, event, state
  enum, DB table/column, Flyway migration.
- Writing any user-facing string (public provider page labels, booking flow
  copy, validation messages, appointment confirmation and reminder text).
- Choosing a REST route slug, an OpenAPI schema name, a notification template
  key, or a `notifications` channel name.
- Reviewing a PR that mixes the two.

## The rules

0. **The repository is English, not only the code.** README, `docs/`, every
   ADR, commit messages **and pull request titles and descriptions**. This was
   the rule from the start and it was broken anyway - in the README, in the
   runbook, in nine ADRs and in every pull request - because nothing measured
   it. `RepositoryLanguageTest` measures it now, and
   `language-waivers.txt` is the debt that predates it. Do not add a line to
   that file to make a build pass: if a document is new, write it in English,
   which costs less than the waiver.
1. **Code is English. Always.** Class, method, variable, package, and file
   names; comments and Javadoc; log event names and exception messages; RFC
   7807 `title`/`detail` written by the server; metric, span, and config keys - all English. The ubiquitous language of the domain is English: `Provider`,
   `ProviderStaff`, `ServiceOffering`, `AvailabilityRule`,
   `AvailabilityOverride`, `AvailableSlot`, `Appointment`, `Customer`,
   `Subscription`, `PlanEntitlements`, `TenantContext` - never `Prestataire`,
   `Prestation`, `Disponibilite`, `RendezVous`, `Abonnement`.
2. **Domain terms are English and shared.** The word used in the code is the
   word used in the OpenAPI schema, the DB table and column, the notification
   template key, the event name, and the ADR. One term per concept, English,
   everywhere. If the business speaks French for a concept, translate it once
   into the ubiquitous English term and keep it fixed (business "prestation" ->
   code `ServiceOffering`; "créneau" -> `AvailableSlot`; "plage horaire
   d'ouverture" -> `AvailabilityRule`; "exception d'agenda" ->
   `AvailabilityOverride`; "annulation" -> `cancellation`).
   The sellable prestation is deliberately `ServiceOffering` and not `Service`:
   `*Service` is reserved by `backend-naming` for application-layer CDI beans,
   and a `Service` aggregate sitting next to a `BookAppointmentService` bean
   makes every import ambiguous. The choice is made once and then holds
   everywhere - class `ServiceOffering`, table `service_offerings`, foreign key
   `service_offering_id`, OpenAPI schema `ServiceOffering`, wire field
   `service_offering_id`, route `/v1/service-offerings`.
3. **User-facing strings carry a stable English key; the French copy lives in
   one place per channel.** No user-visible literal scattered through business
   code. **The i18n catalogue this rule was written around does not exist.**
   There is no `messages*.properties` in the repository, no `ResourceBundle`,
   no injected `messages` bean, and no `Accept-Language` on any route. It was
   not deleted, it was never built, and the reason is that French is still the
   only locale that ships: `BookingNotifications.LOCALE` is the constant
   `"fr"`, the `notifications.locale` column defaults to `'fr'`, and the front
   carries no i18n library at all. A catalogue with one column in it buys
   nothing, so do not add one back believing it went missing. What does hold,
   and is the half of the rule worth having, is the separation: the
   `notifications` row carries the English `kind` and a `payload` of template
   variables under stable English keys, never a rendered French sentence, and
   the copy for each kind sits in one enum per channel - `EmailTemplate` for
   e-mail, `WhatsAppTemplate` for the Meta-approved template names. Keep the
   kinds and the payload keys English and a second locale is a table of copy;
   let French leak into them and it is a rewrite. Build the catalogue the day a
   second locale has a date, not before.
4. **Money, time, and phone numbers stay locale-formatted at the edge, typed
   inside.** Amounts live as `Money(amountMinor, Currency)` in the domain
   (English, numeric); instants are `Instant`/`timestamptz`; phones are E.164
   `PhoneNumber`. Only the presentation layer formats them per locale and per
   the provider's timezone - never store or log a pre-formatted string as the
   source of truth.
5. **URLs and route slugs are English kebab plural nouns behind a version
   segment.** `/v1/providers`, `/v1/service-offerings`, `/v1/appointments`,
   `/v1/customers`, `/v1/opening-hours`, `/v1/closures`. No verbs, no locale in
   the path segment, and no tenant identifier: the same slug serves every
   language and every provider. Two slugs this file used to name are not in the
   published document and never were. `/v1/availability-rules` does not exist
   because the public surface deliberately speaks the shopkeeper's words rather
   than the domain's: the aggregates stay `AvailabilityRule` and
   `AvailabilityOverride`, the tables stay `availability_rules` and
   `availability_overrides`, but the routes are `/v1/opening-hours` and
   `/v1/closures` and the schemas are `OpeningHours` and the `Closure*` family
   (`ClosureView`, `ClosureRequest`, `ClosureList`). That is the
   one place the published name and the code name part company on purpose, and
   `platform-api` is where the trade is argued. `/v1/subscriptions` does not
   exist because there is nothing behind it: `V011` created the `subscriptions`
   table, `com.balaaca.billing` still holds one `package-info.java` and no
   Java, and a route over an empty module publishes a promise no handler can
   keep.
6. **The wire is English and `snake_case`.** Every JSON property and every
   query parameter - `service_offering_id`, `starts_at`, `staff_id`,
   `amount_minor`, `next_cursor` - is an English term in `snake_case`. Never a
   French property name, and never `camelCase` on the wire.
7. **Tests may name behaviour in French; identifiers stay English.**
   `@DisplayName("refuse un rendez-vous qui chevauche un créneau confirmé")` is
   fine because it describes user-visible behaviour, but the method,
   variables, and fixtures inside the test are English.
8. **New code adds zero non-English debt.** Any French identifier or comment
   introduced in a PR is a blocking review finding, not a nit.

## Anti-patterns

- `public class Prestation { ... }` -> rule 1/2, must be `ServiceOffering`.
- `class Service { ... }` as the catalogue aggregate -> rule 2; it collides
  with the `*Service` application-bean suffix, use `ServiceOffering`.
- `class AvailabilityException` for a calendar exception -> rule 2; a
  non-throwable ending in `Exception` is a trap, the aggregate is
  `AvailabilityOverride`.
- `void annulerRendezVous()` -> rule 1/2, must be `cancelAppointment()`.
- `// Vérifie que le créneau est libre` on new code -> rule 1, comment in
  English.
- `throw new IllegalStateException("Le créneau est déjà réservé")` -> rule 1,
  server-authored message in English (the customer never sees this raw string;
  what a customer reads is written on the front or in a channel template).
- `return Response.ok("Rendez-vous confirmé").build()` -> rule 3/6; the API
  answers in English, and the sentence a customer reads belongs to the front or
  to a channel template, never to a JSON body.
- Inserting a fully rendered French SMS body into the `notifications` table
  -> rule 3; store the English `kind` plus its payload and let the channel
  render at send time.
- Route `/rendez-vous`, or a per-locale tree `/fr/rendez-vous` +
  `/en/appointments` -> rule 5, one English slug `/v1/appointments`.
- A JSON body with `serviceOfferingId` or `dateDebut` -> rule 6;
  `service_offering_id` and `starts_at`.
- A `service_offerings.libelle` column -> rule 1, name it
  `service_offerings.name` (or model the localized text explicitly as
  `translations` keyed by locale).

## Minimal correct example

```java
// Domain + code: English identifiers, English server-side messages.
// No providerId on the command: the tenant is ambient, never a parameter
// (see `multi-tenant-rls`). The inbound port is BookAppointmentUseCase; this
// is the bean that implements it (see `backend-naming`).
public record BookAppointmentCommand(ServiceOfferingId serviceOfferingId,
                                     StaffSelection staff,
                                     Instant startsAt,
                                     PhoneNumber customerPhone) {}

@ApplicationScoped
public class BookAppointmentService implements BookAppointmentUseCase {

    @Override
    public AppointmentId handle(BookAppointmentCommand command) {
        // No logging here: business code never logs inline, the audit
        // interceptor does (see `cdi-interceptors`, `pii-masking-logging`).
        // ... resolve the staff member, recompute the slot, freeze the price ...
        return appointments.insertIfAbsent(appointment).id();
    }
}
```

The wire contract for the same operation - English terms, `snake_case`
properties, a versioned kebab-plural route:

```yaml
# POST /v1/appointments
service_offering_id: "8f1c0b0e-2a4d-4c7a-9f3e-6b1d2c5a7e90"
staff_id: null              # null means "any available staff"
starts_at: "2026-09-14T09:30:00Z"
```

And the message the booking owes. The row is entirely English - the kind, the
payload keys, the constant - because it says what the message MEANS, not how it
is said (see `outbox-messaging`):

```java
new PlannedNotification(appointmentId, NotificationKind.BOOKING_CONFIRMATION,
                        NotificationRecipient.CUSTOMER, phone, email, channel,
                        LOCALE,                       // "fr", the only one that ships
                        Map.of("business_name", provider.businessName(),
                               "service_name", offering.name(),
                               "customer_name", customer.fullName(),
                               "starts_at_local", localStart),
                        owedFor, scheduledAt);
```

The French appears once, in the worker, one entry per kind, with placeholders
named after those payload keys. This is the whole of the product's customer
copy on the server side; there is no catalogue behind it (rule 3):

```java
// notification-worker: EmailTemplate
BOOKING_CONFIRMATION(Audience.CUSTOMER,
        "Votre rendez-vous chez {business_name}",
        "Votre rendez-vous est enregistré",
        "Bonjour {customer_name}, {business_name} a bien reçu votre rendez-vous."),
```

## Sibling skills

- `backend-naming` - English suffix/term conventions for the same identifiers,
  the plural snake_case tables, and the `*Service` suffix that forces the
  `ServiceOffering` choice.
- `contract-first` - OpenAPI schema names, `snake_case` wire fields, and error
  codes stay English and shared with the code.
- `money-currency` - `Money`/`Currency` and `PhoneNumber` typing; formatting
  happens only at the edge.
- `temporal-modelling` - instants and the provider timezone are typed inside;
  only the edge renders a local date for a human.
- `outbox-messaging` - a `notifications` row carries an English template key
  and parameters, not rendered prose.
- `pii-masking-logging` - log event names are English, dotted and lowercase,
  and business code does not log at all.
- `code-comments` - comments and Javadoc are English and earn their place.
- `commit-style` - commit messages are English too.
