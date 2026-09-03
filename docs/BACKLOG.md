# Backlog

What is decided but not done, with the reason for waiting. An item with no
reason is not a backlog, it is an oversight.

## Waiting on you

### WhatsApp credentials
**Blocks: every notification.** The channel is written against the published
Graph API contract and tested against a fake server that speaks the same
protocol; only the account is missing. Without it, a salon discovers its
appointments by refreshing a page.

It will take: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (system user),
`WHATSAPP_BUSINESS_ACCOUNT_ID`, EIGHT approved templates with the order of their
parameters (five to the customer, three to the provider: see docs/WHATSAPP.md,
which has the names and the parameter order the worker fills positionally), and the decision **Balaaca number or salon number**
(recommendation: Balaaca - one account to verify, one quota to watch, and a
salon that leaves does not take the number with it).

Take the time it needs: it is a paid subscription and a business verification,
and nothing else is waiting behind it.

### Billing and plan quotas
`billing` has one file and `subscriptions` has not a line of Java.

This is not code waiting to be written, it is **four decisions**: which tiers;
what each tier limits (members? appointments per month? services?); the price in
GNF; and whether there is a free tier. Inventing them would be the worst of both
worlds.

`PLAN_LIMIT_REACHED` **has been removed from the error catalogue**. It was
published there while no path could raise it: a client that branched on it
branched on something that could not happen. It comes back the day the tiers
exist. `ErrorCatalogueTest` now checks both directions, so a published code with
no producer breaks the build.

## Decided, scoped, not yet done

### ~~Rate-limit registrations~~ (done)
`V020` closed the oracle for any account that already has a salon. What remains
is that an account **without** a salon can probe the handles, exactly like any
sign-up form that answers "that name is taken".

Closing it takes a rate limit, not a different error. `RATE_LIMITED` (429) is
already published and already raised, but for booking **contention**
(`BookingContendedException`), which is another subject: a registration limit
would need a counter, and Redis is already in the compose file for that.

To be done when there are enough salons for the list to be worth enumerating.

### ~~A real alerting system~~ (done)
An `Alerter` port, two channels: the log by default, a webhook if
`balaaca.alerts.channel=webhook`. The destination stays your choice: a Telegram
bot, a Discord hook, an ntfy topic and a Slack webhook all accept the same shape.

The hard part was not sending a message but not sending four hundred: a channel
outage produces one dead notification per message, and a channel that receives
four hundred is a channel people mute, after which nothing alerts at all. One
alert per kind per window, and the next one says how many it stands for.

### Deployment, backups
CI builds, tests and checks the contract. **Nothing pushes to the VPS**, there is
no scheduled `pg_dump`, and the image directory is in no backup. See
`DEPLOYMENT.md`.

## Translate the repository to English

**The last step, deliberately.** `code-language` has required English for
everything a developer reads since the pack was written - down to the ADRs and
the commit messages - and it was broken anyway: this README, this file, the
deployment runbook and the nine ADRs are French. Pull request descriptions were
too.

`RepositoryLanguageTest` now freezes that debt. Nothing new can be written in
French, and `language-waivers.txt` lists exactly what is owed. **The pass is
finished when that file holds nothing but comments** - which is a completion
criterion a build can check, rather than a feeling.

Order, when the time comes: `README.md` first (the first thing anyone reads),
then `DEPLOYMENT.md` (an operator is the reader least likely to speak French),
then this file, then the ADRs as one set - a half-French decision log is worse
than a French one.

What a **customer** reads is untouched by this. User-facing copy stays French
first for the launch market, from an i18n catalogue. The rule is that the
repository is English, not that the product is.

## What the design shows and the contract does not serve

Recorded while reproducing the prototype screen by screen, on 2026-09-01. Each
line is an element of the design rendered without that data, or removed.
**Nothing was invented and nothing was added to the backend.** To be decided one
by one.

### The directory, where it shows most

- ~~**`ProviderSummary` has neither the fulfilment modes nor a price from.**~~
  (done) V044 and the card aggregate publish them: `fulfilments` and
  `price_from` are derived from the active service offerings. The foot of the
  directory card is back.

- **`GET /v1/providers` accepts no fulfilment parameter.** The `Mode` checkbox
  group in the filters is removed rather than shipping three boxes that filter
  nothing. A repeatable `fulfilment` parameter would give it back.
- **`LocalityView` has no `provider_count`.** The home page's Places band counts
  eight tiles with figures; only `/v1/areas` publishes a place with a count, so
  the band shows the best-supplied quartiers instead of the design's communes.
- **No total.** `ProviderSummaryPage` publishes the page and `next_cursor`, so
  the toolbar says "N on this page" and not "23 professionals".

### The rest, screen by screen

- `CategoryFamily` has no description: the subtitle under each family on
  /metiers. `CategoryView` has no search aliases: typing "barbiers" finds
  nothing any more.
- `PublicProviderView` has no founding year (`depuis 2016`). `PublicStaffMember`
  has no `bookable`: the `Non reservable` pill.
- `CustomerBookingView` has neither `fulfilment` nor `turnaround_hours`: the
  Deroulement line and the fulfilment note are inferred from the named service
  offering. `available-slots` does not distinguish a closed day from a full one.
- `GET /v1/appointments` has no fulfilment filter: the drop-off queue is filtered
  client-side over +/-90 days, limit 200. It truncates for a busy salon, and the
  sidebar's Agenda counter is a floor.
- `ServiceOfferingView` has no photo: one thumbnail per line costs one request
  per service offering.
- `CustomerSummaryView` has neither `has_notes` nor `no_show_count`;
  `CustomerVisitView` carries no amount: the price of each visit in the history.
- **Moderation: no operation lists the businesses.** The design's
  `moderation/businesses` screen has no source. `ProviderProfileView` has no
  `report_count`, `ProviderReportView` does not carry the booking reference, and
  nothing returns the operator's identity.
- **Compte and Reglages**: neither e-mail verification nor password change on the
  contract side, that is Keycloak. The controls are drawn and disabled, with the
  sentence that says so.
- `409 SLUG_UNAVAILABLE` carries no address suggestion: the design's screen
  offers one.
- **`design.html` shows SIX appointment statuses, the API has five.** The sixth
  is `Pret`, which already exists as `ready_at` on a drop-off without being a
  status.

## Known functional gaps

- ~~**`customers.blocked`.**~~ (done) Blocking means something now:
  `PUT /v1/customers/{id}/blocking` sets the switch, and a booking coming from
  the public page with that number answers `403 FORBIDDEN` - a code from the
  closed catalogue, not a new one. The block binds the page only: the counter
  still writes the person into the diary, and what is already booked stays. The
  refusal does not say why, because the route is anonymous and a sentence naming
  the reason would let anybody read a salon's list of blocked numbers, one number
  at a time.

  **The gate itself was not looking for a substring**: `\b` was already there and
  revealed nothing. `customers.blocked` passed because of `InstantRange blocked`,
  a local variable in the slot calculator. The corpus is now the **string
  literals** of the main sources, which is to say the SQL the application runs,
  per ADR-0008. A variable, a record component, a Javadoc paragraph or a log
  message no longer stand in for a reader. That flushed out `audit_logs.actor_ip`,
  left NULL deliberately and now justified in the waiver file rather than in a
  comment alone.
- **The product's whole French vocabulary is unaccented.** The 35 trades
  (`Esthetique`, `Video`, `Patisserie`, `Electricite`, `Demenagement`), the 8
  families (`Beaute`, `Evenementiel`) and the 51 localities (`Boke`, `Labe`,
  `Nzerekore`, `Gueckedou`, `Telimele`) are seeded unaccented by V016, V025 and
  the locality map. This is customer text, shown on the home page, in every card
  and in the search.
  **The trap**: `ProviderDirectorySqlRepository` does
  `c.label_fr ILIKE '%' || :name || '%'` with no `unaccent`. Accenting the labels
  alone **breaks the search** for anyone typing "esthetique" on a keyboard, which
  everybody will. The two go together: a migration that accents, and a generated
  column `translate(lower(label_fr), 'accented aeiou', 'aeiou')` with a trigram
  index, which the `ILIKE` then reads. `translate` and `lower` are IMMUTABLE,
  `unaccent()` is not and therefore does not index directly. Budget half a day.
  Found by running the stack.
- **`chatbot-service`**: out of scope. It will be a completely detached Python
  service, and not now.

## Done

The appeal: a suspended provider answers the platform, rereads their message, and
the operator reads it in a queue beside the reports. Photos per service offering,
five at most, resized to 1600 px, which settles the weight and closes
steganography in the low-order bits. The onboarding thread:
`GET /v1/provider-profile/readiness` says what is missing BEFORE the refusal, with
the same predicates as the gate.

Ownership transfer, the clientele (three routes plus the screens),
`latitude`/`longitude` removed and replaced by the commune and the quartier on
the public page, the QR code and the public link, a rate limit on registrations,
and the dead `PENDING` text in the four objects that still cited it. Verified in
the database: no function, view or policy names an unreachable provider status any
more. The two remaining occurrences speak of an appointment's status and of a
report's status, both of them real.

On the front, all fifty-five published operations are called.
