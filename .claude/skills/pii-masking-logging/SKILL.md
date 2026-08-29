---
name: pii-masking-logging
description: Use when interpolating any dynamic value — customer phone, email, name, user or appointment id, token, exception message, request payload — into a log line, when binding fields to the structured-logging context at a REST, notification-worker, chatbot or scheduled-job boundary, when writing or editing a logging/audit interceptor, or when reviewing a PR that adds Log.* or System.out.
---

# pii-masking-logging

> **[CANONICAL.md](../CANONICAL.md) pins the symbols.** Table and column names,
> port and exception signatures, error codes, command shapes, migration order
> and interceptor priorities are declared there once. Where this file and
> CANONICAL.md disagree, CANONICAL.md wins and this file is a bug.

Every log line is **structured JSON**, carries a `correlation_id` and a
`provider_id`, and passes every value that identifies a **person** through the
shared masking utility first. The customer's phone number is the primary
identifier of a person in this system and is **never** logged raw. Secrets and
tokens are never logged in any form. Money amounts, by contrast, are fine to
log — a price is not PII, and an audit trail needs it readable. So are the two
operational identifiers that make the logs usable at all.

## When to use

- About to interpolate any value — customer phone, email, name, user id,
  appointment reference, token, exception message, request payload — into
  a log call.
- Writing or editing a logging/audit CDI interceptor or an event listener
  (see `cdi-interceptors`).
- Adding a field to the structured-logging context (MDC-equivalent) at a
  boundary: a REST resource, the `notification-worker` drain loop, a
  `chatbot-service` call, a scheduled job.
- Reviewing a PR that adds `Log.*` / `System.out` — check masking,
  correlation id, provider id, event name, and JSON format.

## The rules

1. **Logs are JSON, one event per line, and the message is a dotted
   lowercase event name.** Enable Quarkus JSON logging
   (`quarkus.log.console.json=true`). The message is a stable identifier —
   `appointment.booked`, `appointment.book.slot_unavailable`,
   `notification.dispatch.failed` — not a sentence with values baked in.
   Values are MDC keys in `snake_case`; prose lines are not parseable and not
   greppable.
2. **Every line carries `correlation_id` and `provider_id`, and both are
   logged RAW.** Bind them to the logging MDC at the boundary: the correlation
   id from the incoming trace header, the provider id from
   `TenantContext.require()` — resolved from the database, not from a JWT
   claim, so it is the same value RLS is running under. Clear them in
   `finally`. These two are **operational identifiers, not PII**: neither
   resolves to a natural person, and masking them destroys the only thing they
   exist for, which is joining every line of one request and every line of one
   tenant. A tenant-scoped line without a `provider_id` is a defect, and that
   includes background work: the drain loop binds the provider id off the
   notification row.
3. **All values that identify a person pass through `LogMasking` before
   logging.** The shared utility lives in `com.balaaca.sharedkernel.logging`
   as `LogMasking`. Use `maskPhone`, `maskEmail`, `maskName`, `maskId`,
   `maskToken`, `sanitizeMessage`, `abbreviate`. Do not hand-format sensitive
   fields.
4. **`maskId` applies to identifiers that resolve to a natural person, and
   only those.** `customer_id`, `user_id`, `appointment_id` all lead back to
   one human being through a single indexed lookup, so they are masked.
   `provider_id` and `correlation_id` are not: a provider is a business, and a
   correlation id is a per-request token with no subject at all — see rule 2.
   This is the whole boundary; there is no third category and no judgement
   call at the call site.
5. **Never log a secret, JWT, OIDC token, Keycloak client secret, API key,
   or secret-store value — masked or not.** If the field is a credential,
   drop it entirely; there is no acceptable masked form of a secret in a
   log. The application never sees a password or a reset token at all, and
   nothing may reintroduce one into a log line.
6. **Never log a raw phone number, and never use one as a log key or a
   correlation value.** The phone is how a customer is identified across every
   provider on the platform, so a leaked log line is a re-identification across
   tenants, not just one record. `maskPhone` always — in production, in dev, in
   a test fixture that prints. To correlate two lines about the same person,
   log `maskId(customerId)`; masked phones collide by design.
   This rule is about **logging and correlation values only**. The phone
   deliberately *is* the customer's business key: it is the natural key on
   `customers`, unique per provider, and it is what the notification row
   carries as a recipient. Keying the domain on it is the design; keying a log
   field, an MDC entry, a metric label or a trace attribute on it is the leak.
7. **`maskPhone` has exactly one contract.** Given an E.164 string, it returns
   `"+"` followed by one `*` per hidden digit and the final two digits —
   `+224622000123` becomes `+**********23`. For `null`, or fewer than four
   digits after the optional `+`, it returns `"***"`. No calling prefix is
   preserved, so the masked form does not disclose the customer's country
   either, and it is region-agnostic by construction. Every file that
   describes masking describes this and nothing else.
8. **Money is loggable.** `Money(amountMinor, currency)` and an appointment's
   frozen `customerPrice()` may be logged verbatim; audit needs them, and
   there is no scaling to undo before printing a minor amount. Masking a price
   "to be safe" only makes the audit trail useless.
9. **Run exception messages through `sanitizeMessage`.** Hibernate, driver,
   and channel-gateway exceptions routinely embed connection URLs,
   hostnames, SQL, bind parameters, and occasionally a phone number.
   Sanitize before logging; log the throwable type explicitly.
10. **Masking happens at the log boundary, not in business code and not in the
    value object.** Domain and application classes throw or return; the
    logging/audit interceptor or event listener masks. Business code never
    pre-masks its own data, and never logs inline (see `cdi-interceptors`). A
    domain object that carries a pre-masked phone is a corrupted domain
    object, and a `PhoneNumber.toString()` that masks is worse: it corrupts
    the send path silently, because the masked value ends up in the
    `notifications` recipient column and every reminder fails delivery (see
    `money-currency`).
11. **Extend the utility, never fork it.** A new value shape gets a new
    helper inside `shared-kernel` `LogMasking`, unit-tested, reused
    everywhere. No per-module private `maskFoo()`.

## Anti-patterns

- `Log.info("customer " + customer.phone().e164() + " booked")` → rules 3, 6
  and 1; `maskPhone` it, log `customer_id` masked instead, and make the
  message an event name.
- Using the raw phone as an MDC key or a correlation value ("it is unique
  and stable") → rule 6; that is precisely why it must not be there. The same
  phone as `customers.phone_e164` is correct and required.
- `MDC.put("provider_id", LogMasking.maskId(tenantContext.require()))` →
  rules 2 and 4; the provider id is an operational identifier, logged raw. A
  masked tenant id cannot be filtered on, which defeats the reason rule 2
  makes it mandatory.
- `MDC.put("correlation_id", LogMasking.maskId(traceId))` → rules 2 and 4;
  same reasoning, and a masked correlation id joins nothing.
- `MDC.put("appointment_id", appointment.id().value())` raw → rule 4; an
  appointment resolves to one customer, so `maskId` it.
- `Log.debug("jwt=" + token)` or `Log.info("clientSecret=" + secret)` →
  rule 5; drop it, no masked form is acceptable for a secret.
- `Log.error("failed: " + ex.getMessage())` when the message holds a JDBC
  URL or the bound `starts_at` and phone of a rejected booking → rule 9;
  `sanitizeMessage(ex.getMessage())`.
- Masking `appointment.customerPrice()` "to be safe" → rule 8; money is not
  PII, keep it readable for audit.
- A private `String maskPhone(String p)` copied into a `booking` class →
  rule 11; add it to `shared-kernel` `LogMasking`.
- A masking helper that assumes a `+224` prefix or a fixed length, or one that
  keeps a different number of digits than rule 7 states → rules 7 and 11.
- A log line with no `provider_id` because it ran in the notification
  worker → rule 2; bind the provider on background and worker boundaries
  too.
- `LOG.info("Appointment %s confirmed for %s")` → rule 1; the message is
  `appointment.confirmed` and the values are MDC keys.
- `Log.info(...)` inside an application service, "just this once" → rule 10;
  the interceptor is the only place logging happens.

## Minimal correct example

```java
// com.balaaca.sharedkernel.logging.LogMasking - the single source of truth.
public final class LogMasking {
    private LogMasking() {}

    /**
     * Masks an E.164 phone number, keeping only the last two digits:
     * "+224622000123" -> "+**********23". Null, or fewer than four digits,
     * yields "***". Region-agnostic on purpose: no calling prefix survives,
     * so the masked form does not disclose the customer's country either.
     */
    public static String maskPhone(String e164) {
        if (e164 == null) return "***";
        String digits = e164.startsWith("+") ? e164.substring(1) : e164;
        if (digits.length() < 4) return "***";
        return "+" + "*".repeat(digits.length() - 2)
                   + digits.substring(digits.length() - 2);
    }

    public static String maskEmail(String email) {            // nullable field
        if (email == null || !email.contains("@")) return "***";
        int at = email.indexOf('@');
        String user = email.substring(0, at);
        String head = user.isEmpty() ? "" : user.substring(0, 1);
        return head + "***@" + email.substring(at + 1).replaceAll("^[^.]+", "***");
    }

    public static String maskName(String name) {              // "Mariama" -> "M***"
        if (name == null || name.isBlank()) return "***";
        return name.strip().substring(0, 1) + "***";
    }

    /**
     * Masks an identifier that resolves to a natural person: customer_id,
     * user_id, appointment_id. Never applied to provider_id or
     * correlation_id - those are operational identifiers, logged raw.
     */
    public static String maskId(Object id) {
        String s = String.valueOf(id);
        return s.length() <= 4 ? "***" : s.substring(0, 4) + "…";
    }

    public static String sanitizeMessage(String msg) {        // strip URLs/hosts/SQL
        return msg == null ? "" : msg.replaceAll("\\b\\w+://\\S+", "[URL]");
    }
    // maskToken(...), abbreviate(...) live here too.
}
```

The boundary binds the two mandatory operational identifiers, **raw**, and
clears them in `finally`. This runs once per request, in the REST filter — not
in any business class:

```java
@Provider
public class LoggingContextFilter implements ContainerRequestFilter,
                                             ContainerResponseFilter {

    @Inject TenantContext tenantContext;

    @Override
    public void filter(ContainerRequestContext request) {
        // Operational identifiers: raw, never masked (rules 2 and 4).
        MDC.put("correlation_id", correlationIdOf(request));
        MDC.put("provider_id", tenantContext.require().value().toString());
    }

    @Override
    public void filter(ContainerRequestContext req, ContainerResponseContext res) {
        MDC.remove("correlation_id");
        MDC.remove("provider_id");
    }
}
```

The logging/audit CDI interceptor is the only place a log call is written.
Business code stayed silent; here the values are masked and the event emitted:

```java
@Audited
@Interceptor
@Priority(Interceptor.Priority.PLATFORM_AFTER + 10)
public class AuditLoggingInterceptor {

    private static final Logger LOG = Logger.getLogger(AuditLoggingInterceptor.class);

    @AroundInvoke
    Object audit(InvocationContext ctx) throws Exception {
        MDC.put("operation", ctx.getMethod().getName());
        try {
            Object result = ctx.proceed();
            // correlation_id and provider_id are already bound by the filter.
            MDC.put("outcome", "success");
            LOG.info("audit.completed");                   // dotted event name
            return result;
        } catch (Exception ex) {
            MDC.put("outcome", "failure");
            MDC.put("error_type", ex.getClass().getSimpleName());
            MDC.put("detail", LogMasking.sanitizeMessage(ex.getMessage()));
            LOG.warn("audit.failed");
            throw ex;
        } finally {
            MDC.remove("operation");
            MDC.remove("outcome");
            MDC.remove("error_type");
            MDC.remove("detail");
        }
    }
}
```

A booking line, fully masked where it must be, raw where it must be, still
useful:

```java
MDC.put("customer_id", LogMasking.maskId(appointment.customerId()));
MDC.put("appointment_id", LogMasking.maskId(appointment.id()));
MDC.put("customer_phone", LogMasking.maskPhone(customer.phone().e164()));
MDC.put("customer_price_amount_minor",
        appointment.customerPrice().amountMinor());              // money: raw
MDC.put("customer_price_currency",
        appointment.customerPrice().currency().code());
// provider_id and correlation_id: already bound raw at the boundary.
LOG.info("appointment.confirmed");
```

## Sibling skills

- `cdi-interceptors` — logging/audit is an interceptor concern; masking is
  its second step.
- `code-language` — logs, keys, and event names are English; only user-facing
  text is French-first from the i18n catalogue.
- `code-comments` — no emoji in a log line; the level and an `outcome` field
  carry the status.
- `multi-tenant-rls` — `provider_id` on every line is the same value
  `TenantContext` hands to `set_config('app.provider_id', …)` on the
  connection.
- `money-currency` — `Money` is loggable; `PhoneNumber` never masks itself,
  because a masked recipient breaks every reminder.
- `outbox-messaging` — a notification row holds a recipient phone and a
  `last_error`; both are masked or sanitized before they reach a log.
- `backend-exceptions` — thrown exceptions become masked audit lines;
  client-facing errors are RFC 7807 and carry no PII either.
- `backend-srp` — masking plus structured logging is one concern, one home.
