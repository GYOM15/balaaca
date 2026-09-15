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

### Paying for a service on the platform

You are looking for a rail that does **split payment**, so a commission is taken
on each transaction rather than invoiced afterwards. Nothing is built, and
[ADR-0005](adr/0005-scope-of-payment.md) is why: the seams are prepared, the
platform never holds the funds, and the topology decision waits for facts about
the rails.

What that ADR does **not** answer is the thing you raised, and it is a product
decision rather than an engineering one:

**Can a provider switch online payment off?** If it is a switch on the profile,
a business can turn it off, tell its customers to pay in the shop, and keep using
the hub for nothing. If there is no switch, a business without a mobile money
account cannot be listed at all, which in Guinea is most of them on day one.

The two shapes worth weighing, neither of them chosen:

- **Payment is a property of the SERVICE, not the business.** A salon publishes
  some services payable online and some not, and the platform's cut applies to
  what went through it. A business that pays for nothing online is a business
  that gets the free tier of the product.
- **Payment is a property of the PLAN.** Online payment is what a paid tier
  buys, and the commission replaces the subscription rather than sitting beside
  it. This is the one that makes "turn it off to avoid the fee" incoherent,
  because turning it off is what costs the provider the tier.

Whichever it is, one thing has to be decided before the first line: **what
"paid" does to the appointment state machine.** Today `PENDING` and `CONFIRMED`
are the only states a slot is held in, and a payment that has been authorised but
not captured is a third thing. Adding it later means a migration on the one table
this schema most carefully constrains.

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
CI builds, tests and checks the contract. **Nothing pushes to the VPS.**

`pg_dump` and its restore exist now (`scripts/backup.sh`, `scripts/restore.sh`,
rehearsed - see docs/DEPLOYMENT.md), and they write to the same disk as the
thing they copy. That covers a bad migration and a wrong `DELETE`; it does not
cover the disk. **Off-site is the same conversation as the images below**, and
neither moves until there is a bucket.

**The images go to Cloudflare R2**, decided, and that is what closes the second
half: today they sit on the deployment's own disk, in no backup, and reviews
have just made that content customers cannot reproduce. `ImageStore` is already
the port for it - `store`, `read`, `discard`, and a `Shape` - so the change is
an adapter beside the filesystem one and a property that chooses between them,
not a change to a single caller. It was written that way on purpose.

What is still owed with it: the bucket and its credentials, whether objects are
served through R2's public domain or kept behind `/v1/media/<name>` so the
platform can still refuse one, and what happens to the files already on disk.

## ~~Translate the repository to English~~ (done)

The criterion was that `language-waivers.txt` should hold nothing but comments,
which a build can check rather than a feeling. It does. The thirteen documents
it named - this file included - are English, and the nine ADRs were renamed out
of French with them, because a file name is something a developer reads too.

The waiver file is kept, empty. `RepositoryLanguageTest` reads it, and a debt
with nowhere to be written down is a debt that gets written into the code.

What a **customer** reads is untouched by this. User-facing copy stays French
first for the launch market. The rule is that the repository is English, not
that the product is.

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

- ~~**`GET /v1/providers` accepts no fulfilment parameter.**~~ (was already
  false) It has taken a repeatable `fulfilment` since it was published, with a
  description pinning it to the same source the card's badges read. This line,
  and the same claim in a comment in `filters.tsx`, are why the three boxes
  were missing from a filter that was already built and already tested. They
  are there now.
- ~~**`LocalityView` has no `provider_count`.**~~ (was already false) It has
  one, served, and the Places band was reading `/v1/areas` because the
  component's own doc repeated this line. The band draws communes and
  prefectures now, which is what its heading always promised, and the tiles
  filter on `locality` - which walks DOWN the tree, so a Conakry tile returns
  every commune under it.
- ~~**No total.**~~ (was already false) `ProviderSummaryPage` publishes one and
  the resource fills it.

  **Three stale lines in one section.** They were not merely out of date: each
  one was READ as a constraint and shaped a screen around itself. The cost of a
  backlog nobody prunes is not confusion, it is work that gets designed around
  a limit that no longer exists.

### The rest, screen by screen

- `CategoryFamily` has no description: the subtitle under each family on
  /metiers. Eight sentences to write for a page nobody lingers on.
- ~~`CategoryView` has no search aliases: typing "barbiers" finds nothing.~~
  (the plural, done) V055 singularises what was TYPED, which cannot lose a
  match because the stripped form is a prefix of the folded one. Matching the
  other way round was rejected: `position('spa' in 'espace')` is 2.

  **True synonyms are still owed and are the owner's to write** - "coiffeur"
  for "Coiffure", "clim" for "Climatisation". `localities.aliases` is the
  precedent and the same column shape would serve. Inventing thirty-five
  Guinean trade vocabularies is not an engineering decision.
- **Multi-word queries match nothing.** "salon de coiffure" reaches no label,
  because no stored label contains that phrase. That needs tokenisation rather
  than a longer LIKE.
- `PublicProviderView` has no founding year (`depuis 2016`), and it is not
  wanted: a business that opened this year looks worse for carrying one, which
  is half of a launch market.
- ~~`PublicStaffMember` has no `bookable`: the `Non reservable` pill.~~ (not
  buildable, and should not be) `PublicStaffSqlRepository` reads
  `WHERE status = 'ACTIVE' AND bookable`, so a customer is never shown somebody
  they cannot book. The field would be `true` on every row it ever appeared on,
  and the pill would be a label for a case the API refuses to produce.
- `CustomerBookingView` has neither `fulfilment` nor `turnaround_hours`: the
  Deroulement line and the fulfilment note are inferred from the named service
  offering. `available-slots` does not distinguish a closed day from a full one.
- ~~`GET /v1/appointments` has no fulfilment filter.~~ (done) It takes a
  repeatable one, matched against the mode frozen on the appointment. The queue
  asks for `DROP_OFF` instead of sifting a hundred and eighty days in the
  browser, and `AppointmentPage` publishes a `total` so a badge counts what
  matches rather than the rows that fit on a page.
- `ServiceOfferingView` has no photo: one thumbnail per line costs one request
  per service offering.
- `CustomerSummaryView` has no `has_notes`, and `CustomerVisitView` carries no
  amount: the price of each visit in the history. ~~`no_show_count`~~ (done) -
  `visits` counts every appointment in every state on purpose, so it cannot
  tell eight kept from eight booked and two honoured, and that is the one
  judgement a provider has to make before blocking anybody.
- ~~**Moderation: no operation lists the businesses.**~~ (done)
  `GET /v1/admin/providers` publishes every business with its standing, so the
  suspension lever is no longer keyed on a slug nobody could look up. What is
  still owed on that screen: `ProviderProfileView` has no `report_count`, and
  `ProviderReportView` does not carry the booking reference.

  **Who did it** is answered off-screen rather than in a view. Every write those
  routes perform now writes `audit_logs` with `actor_role = 'OPERATOR'`, and
  with one operator that is enough - see docs/DEPLOYMENT.md for the query. A
  journal screen and a name beside the row come with the second operator, and so
  do the fine-grained capabilities: the nine routes already carry
  `@RolesAllowed`, so swapping a blanket check for a per-capability one is an
  afternoon on one file, while the audit rows are the half that cannot be
  backfilled. Trigger: the day somebody other than the owner is given access.
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
- **A provider can be their own customer, and code cannot stop them.** Booking
  from the public page needs no account and no verified telephone number, which
  is the product working as intended: a customer in Conakry has neither. So a
  provider can take a slot on their own page under any name and leave a review
  on it afterwards. What that costs them is now real rather than nothing:
  a review needs `ends_at <= now()` (V050, unchanged), so the slot has to be
  a genuine slot that has genuinely passed, and `COMPLETED` is refused before
  the appointment begins, so the diary cannot be closed out in advance.

  **What is deliberately NOT built**: any detection of it. The one signal
  available - the customer's number equalling the provider's published one -
  is defeated by a second SIM and refuses a salon owner booking for their own
  mother, and there is no second signal, because the public route sees no token
  even when the browser is signed in. This product's answer to a bad-faith
  provider is the one already decided: no vetting at the door, the sanction
  before launch, the back-office after a report. A review can already be taken
  down. Revisit if and when reports say it is actually happening.
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
