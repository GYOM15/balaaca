# Balaaca - brief for a rebuilt front end

This document exists to be handed to somebody who has never seen this
repository, so they can design and build the whole interface from nothing. It
describes what the product IS, what the back end already guarantees, and the
handful of rules a screen cannot break without the server refusing it.

It deliberately says almost nothing about layout. That is the part being
redone.

Everything here was read out of the running system on 2026-08-31, not from
memory. The API has **63 published operations**; every one of them is listed.

---

## 1. What the product is

A hub of service providers in Guinea. Two audiences that never meet:

- **A customer** looking for a hairdresser, a mechanic, a caterer or a plumber
  near them. They arrive from a search, a WhatsApp link or a QR code on a
  shopfront. They do not have an account and never will.
- **A provider** - a salon, a garage, a tailor - running their own diary. They
  sign in, publish a page, and take bookings.
- **The platform operator** - one person - who can take a business off the hub
  and read what customers reported. There is exactly one such account.

The market matters to every decision: **mid-range Android telephones on 3G, in
Conakry and in the interior**. A page that does not finish loading costs the
provider a customer.

Customer-facing copy is **French**. That is not negotiable and it is not a
translation of English - write it in French first.

---

## 2. Brand

### Palette (already in use, tokens exist)

| Role | Value |
| --- | --- |
| Brand primary | `#123C35` deep green |
| Brand primary hover / press | `#0C302A` / `#081F1B` |
| Accent | `#C9A86A` gold |
| Accent strong / subtle | `#7E6023` / `#F4EDDD` |
| Background | `#FAF8F2` warm off-white |
| Background sunken | `#F3F0E7` |
| Surface | `#FFFFFF` |
| Text primary / secondary / tertiary | `#17201E` / `#505653` / `#6B716E` |
| On dark: text / muted | `#FFFFFF` / `#B6C6C1` |

Semantic, each with a subtle and a border tone:

| | Main | Subtle | Border |
| --- | --- | --- | --- |
| Success | `#147A45` | `#E7F2EB` | `#A9CDB8` |
| Warning | `#9C5715` | `#FAF0E4` | `#DEBE93` |
| Danger | `#A32B22` | `#F9EAE8` | `#DFAFAA` |
| Info | `#1F5F86` | `#E8EFF4` | `#A8C4D6` |

Green and gold is the identity. It should read as **trustworthy and warm**, not
corporate - the whole product exists because people do not know whom to trust.

### Type

**Manrope** (Google Fonts), served self-hosted at build time. One family; the
hierarchy comes from weight and size, not from a second face.

A hard lesson from the previous attempt: **79 % of the characters on the old
home page sat at 12 or 14 px, and neither heading was larger than the body.**
Nothing was more important than anything else. Sizes must carry hierarchy.

### Radii, shadows, spacing

Radii 4 / 8 / 12 / 9999 px. Shadows are near-flat (`0 1px 2px rgba(23,32,30,.05)`
plus a wider soft one) - this is not a shadow-heavy design. Spacing is a 4 px
scale.

### Illustration - the important part

There is an existing SVG set, **all single-path, currentColor, no raster**:

- **81 interface icons** (search, calendar, clock, phone, message, check,
  chevrons, upload, lock, eye, map-pin, wallet, …).
- **7 scene sketches** used as empty states and page decoration: `braiding`,
  `chair`, `mechanic`, `notebook`, `photographer`, `storefront`, `tailor`,
  `tools`.
- **18 trade glyphs**, one per trade: barbier, coiffure, couture,
  decoration-evenementielle, dj-animation, esthetique, fleuriste,
  location-salle, location-vehicule, maquillage, onglerie, patisserie,
  photographie, sonorisation-eclairage, spa-massage, traiteur, tresses, video.

**17 trades have NO glyph** and this is a real gap the rebuild should close:
auto-ecole, climatisation, coach-sportif, cours-langues, cours-particuliers,
demenagement, desinsectisation, electricite, energie-solaire,
formation-professionnelle, lavage-auto, mecanique-auto, mecanique-moto,
nettoyage, plomberie, reparation-telephone, securite-electronique.

The set must stay **one visual language**: same stroke weight, same corner
treatment, same optical size, `currentColor` so a glyph inherits its context.

---

## 3. The trades, and how they group

35 trades in 8 families. The families are how a customer browses; the trade is
what a provider picks (exactly one).

| Family | Trades |
| --- | --- |
| **beaute** | barbier, coiffure, esthetique, maquillage, onglerie, tresses |
| **bien-etre** | coach-sportif, spa-massage |
| **atelier** | couture |
| **evenement** | decoration-evenementielle, dj-animation, fleuriste, location-salle, photographie, sonorisation-eclairage, video |
| **table** | patisserie, traiteur |
| **auto** | auto-ecole, lavage-auto, location-vehicule, mecanique-auto, mecanique-moto |
| **maison** | climatisation, demenagement, desinsectisation, electricite, energie-solaire, nettoyage, plomberie, reparation-telephone, securite-electronique |
| **savoir** | cours-langues, cours-particuliers, formation-professionnelle |

Each trade carries a live `provider_count`. A design that shows every trade
equally will show 30 empty ones at launch - show what holds somebody, and put
the rest behind "voir tout".

**"Mariage" is not a trade.** A wedding section is one query over several
trades at once (photographie, traiteur, dj-animation, decoration…), because a
photographer shoots weddings *and* corporate events *and* portraits.

---

## 4. Geography

Two levels, modelled differently on purpose.

- **A closed map**: 8 regions, 33 prefectures, the 10 communes of Conakry - 51
  rows covering the whole country, changed only by migration. A `<select>` with
  the prefectures under their region and Conakry's communes under it. Filtering
  matches **down the tree**: asking for `conakry` finds a business filed under
  `ratoma`.
- **The quartier**: free text. Guinea's quartiers are thousands of rows the
  platform does not author, so a curated list would be missing exactly the one
  the next provider lives in. The API offers what has already been written
  (type-ahead), without forbidding the rest.

---

## 5. The three shapes of a service

This is the single most important product idea and the old interface expressed
none of it.

| Shape | What the customer does | Extra field |
| --- | --- | --- |
| `ON_SITE` | Sits down and waits | - |
| `DROP_OFF` | Hands the work over, comes back | `turnaround_hours` - "prêt sous 48 h" |
| `AT_CUSTOMER` | The provider travels to them | An address on the booking |

They are **mutually exclusive** - the database refuses any pairing.

On a `DROP_OFF`, `duration_minutes` is the handover at the counter, **not the
work**. A page that shows it as the length of the job tells somebody a repair
takes ten minutes.

On an `AT_CUSTOMER`, the booking form **must** ask for an address: commune
(optional), quartier (optional), and directions (required, e.g. *« derrière la
mosquée de Nongo, portail bleu »*). There are no coordinates and there will be
none - a latitude and longitude is a surveillance-grade fact about a private
home and nothing in the product reads one.

---

## 6. Every page the product needs

### Public - no account

| Page | What it must do |
| --- | --- |
| **Home / directory** | Search by words, trade (several at once), commune (down the tree) and quartier. Results are cards. Ordered by name, always - a relevance ranking breaks the cursor. |
| **Provider page** `/p/{slug}` | Cover, logo, name, trade, place, contact, opening hours, the team, and the catalogue: each service with its price, its shape, and up to 5 photographs. **Each service row must lead straight into booking that service.** |
| **Booking** `/p/{slug}/reserver` | Service → person (optional) → date → slot → details. State lives in the URL so the back button works. Address block only for `AT_CUSTOMER`. |
| **My booking** `/bookings/{reference}` | What was booked, when, with whom, the price, the promise on a drop-off. Reschedule, cancel, report a problem. |
| **Join a team** `/rejoindre` | Redeem an invitation code. |
| **Sign up** `/inscription` | Handle, business name, trade. |
| **Marketing** | For providers: what it is, how it works, pricing. |

### Provider - signed in

| Page | What it must do |
| --- | --- |
| **Diary** | The day and the week. Confirm, cancel, complete, mark a no-show, reschedule, move somebody to another chair, mark a drop-off ready, move a promise. Enter a walk-in. |
| **Services** | Create and edit, with the three shapes. Who performs each service. Up to 5 photographs each. |
| **Hours** | The week, plus closures and time off. |
| **My page** | Everything a customer reads, the logo and cover, the commune and quartier, the public link and its QR code, and the publish switch. |
| **Clientele** | Everybody who has booked, searchable by name or phone, with each person's history and a private note. |
| **Team** | Add, invite, deactivate, hand the business over. |
| **Contestation** | Only when suspended: why, and a way to answer. |

### Operator - one account

| Page | What it must do |
| --- | --- |
| **Moderation** | The reports customers filed and the answers providers sent. Suspend with a reason, reinstate, mark things seen. |

---

## 7. Rules a screen cannot break

The server enforces these. A design that ignores them produces refusals the
user cannot act on.

1. **Publishing needs three things**: an active service, opening hours, and
   somebody bookable. `GET /v1/provider-profile/readiness` answers all three
   with the same predicates the gate uses. **Do not offer the publish switch
   when it would be refused - say what is missing, with a link to each.**
2. **A slug never changes.** It is on the QR code and in every message already
   sent.
3. **Only bookable slots are published.** There is no grid of taken slots: a
   minute-by-minute occupancy map of a named person at a named address, served
   to anyone, is surveillance. Lay bookable slots over the separately published
   opening hours.
4. **Prices are frozen at booking.** What the customer was quoted never changes
   because the provider re-priced.
5. **A booking needs an `Idempotency-Key`.** Double-booking is as harmful as a
   double charge.
6. **Five photographs per service**, and the first is the one shown in a list.
7. **Images**: JPEG and PNG only, 5 MB max, scaled to 1600 px on the long edge,
   metadata stripped.
8. **A suspended business** disappears from every public path at once but keeps
   its diary - bookings already made stand.
9. **Errors** come back as a closed set of codes. Every one a screen shows must
   be one of: `VALIDATION_FAILED`, `IDEMPOTENCY_KEY_REQUIRED`, `UNAUTHENTICATED`,
   `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `SLOT_UNAVAILABLE`,
   `INVALID_STATE_TRANSITION`, `SLOT_OUTSIDE_AVAILABILITY`,
   `CANCELLATION_DEADLINE_PASSED`, `CURRENCY_MISMATCH`, `IDEMPOTENCY_KEY_REUSED`,
   `RATE_LIMITED`, `INTERNAL_ERROR`, `SLUG_UNAVAILABLE`, `ALREADY_REGISTERED`.
   Inventing a key means the message never shows.

---

## 8. What is wrong today, and must not be rebuilt

Found by using the product, not by a test.

1. **There is almost no success feedback.** Eleven error redirects, zero
   success redirects. Saving a page, creating a service, uploading a photo, and
   adding a note all say nothing at all. A user who cannot tell whether
   something worked does it again - which is exactly what happened.
2. **Navigation is a flat list of six items with no order and no state.**
   Nothing says that services and hours come before publishing. Two screens
   (contestation, moderation) are in no navigation at all.
3. **The booking reference is 43 characters**, case-sensitive, with dashes and
   underscores: `QTE8_RAsgf-_wvAqtiWyYEiMqeFKlgNq9F2vqdoE46g`. A customer
   cannot read it over the telephone, copy it, or dictate it. It should be
   short and unambiguous - the length is being changed; assume something like
   **8 characters** a person can say out loud.
4. **No onboarding thread.** Registration used to drop a provider on a form
   with no idea what was required. A checklist now exists; the rebuild should
   make it the spine of the first session.

---

## 9. Technical constraints on the implementation

The finished design will be ported into **Next.js 16 App Router, server
components only**: no client-side state, no `useState`, no `onClick`.
Interactivity today is forms, server actions, and URL state.

**This is the constraint most likely to bite.** Things that need a decision:

- A field that appears when a radio is chosen (the drop-off delay, the address
  block) cannot be hidden without client JavaScript today. Either the design
  accepts always-visible fields with clear labels, or we agree to introduce a
  small amount of client-side code.
- Image previews before upload, live search-as-you-type, drag-to-reorder and
  modal dialogs are all client-side. Say so explicitly where the design needs
  them, and we will decide rather than discover it during the port.

Everything else is free: this is HTML and CSS, and the port is mechanical.

---

## 10. Known gap outside the interface

**Keycloak does not verify e-mail addresses** - `verifyEmail: false` in the
realm. Anybody can register with an address they do not own. The rebuild is a
good moment to turn it on, which also means the Keycloak login, registration
and e-mail templates should be themed to match this identity rather than left
as the default.

---

## 11. The complete operation inventory

Every published operation, so nothing is designed for that does not
exist and nothing that exists is left without a screen.

```
GET    /v1/appointments                                     listAppointments             auth
POST   /v1/appointments                                     bookWalkIn                   auth
POST   /v1/appointments/{id}/cancellation                   cancelAppointment            auth
GET    /v1/me                                               describeCurrentMember        auth
POST   /v1/staff                                            addStaffMember               auth
GET    /v1/staff                                            listStaff                    auth
GET    /v1/booking-policy                                   getBookingPolicy             auth
PUT    /v1/booking-policy                                   replaceBookingPolicy         auth
GET    /v1/provider-profile/readiness                       getReadiness                 dashboard:read
GET    /v1/provider-profile/qr-code                         getProviderQrCode            dashboard:read
POST   /v1/provider-profile/logo                            replaceProviderLogo          auth
POST   /v1/provider-profile/cover                           replaceProviderCover         auth
GET    /v1/media/{name}                                     getMedia                     PUBLIC
PUT    /v1/staff/{id}                                       replaceStaffMember           auth
POST   /v1/staff/{id}/ownership                             transferOwnership            staff:write
POST   /v1/staff/{id}/invitation                            inviteStaffMember            auth
POST   /v1/invitations/{code}/acceptance                    acceptStaffInvitation        auth
GET    /v1/providers/{slug}/staff                           listPublicStaff              PUBLIC
GET    /v1/opening-hours                                    listOpeningHours             auth
PUT    /v1/opening-hours                                    replaceOpeningHours          auth
GET    /v1/closures                                         listClosures                 auth
POST   /v1/closures                                         createClosure                auth
DELETE /v1/closures/{id}                                    deleteClosure                auth
GET    /v1/service-offerings                                listServiceOfferings         auth
POST   /v1/service-offerings                                createServiceOffering        auth
PUT    /v1/service-offerings/{id}                           replaceServiceOffering       auth
POST   /v1/appointments/{id}/reschedule                     rescheduleAppointment        auth
POST   /v1/appointments/{id}/readiness                      markAppointmentReady         auth
PUT    /v1/appointments/{id}/promise                        replaceReadyBy               auth
POST   /v1/appointments/{id}/confirmation                   confirmAppointment           auth
POST   /v1/appointments/{id}/completion                     completeAppointment          auth
POST   /v1/appointments/{id}/no-show                        markAppointmentNoShow        auth
GET    /v1/providers/{slug}/available-slots                 listAvailableSlots           PUBLIC
GET    /v1/bookings/{reference}                             getBooking                   PUBLIC
POST   /v1/bookings/{reference}/reschedule                  rescheduleBooking            PUBLIC
POST   /v1/bookings/{reference}/cancellation                cancelBooking                PUBLIC
POST   /v1/providers/{slug}/appointments                    bookAppointment              PUBLIC
GET    /v1/categories                                       listCategories               PUBLIC
GET    /v1/service-offerings/{id}/photos                    listServicePhotos            dashboard:read
POST   /v1/service-offerings/{id}/photos                    addServicePhoto              catalog:write
DELETE /v1/service-offerings/{id}/photos/{photo_id}         removeServicePhoto           catalog:write
GET    /v1/service-offerings/{id}/performers                listServicePerformers        dashboard:read
PUT    /v1/service-offerings/{id}/performers                replaceServicePerformers     catalog:write
POST   /v1/bookings/{reference}/report                      reportProvider               PUBLIC
GET    /v1/provider-profile/contestation                    getContestation              dashboard:read
POST   /v1/provider-profile/contestation                    contestSuspension            profile:write
GET    /v1/admin/contestations                              listContestations            admin:moderation
POST   /v1/admin/contestations/{id}/reading                 readContestation             admin:moderation
POST   /v1/admin/providers/{slug}/suspension                suspendProvider              admin:moderation
DELETE /v1/admin/providers/{slug}/suspension                reinstateProvider            admin:moderation
GET    /v1/admin/reports                                    listProviderReports          admin:moderation
POST   /v1/admin/reports/{id}/review                        reviewProviderReport         admin:moderation
GET    /v1/customers                                        listCustomers                dashboard:read
GET    /v1/customers/{id}                                   getCustomer                  dashboard:read
PUT    /v1/customers/{id}/notes                             replaceCustomerNotes         dashboard:read
GET    /v1/localities                                       listLocalities               PUBLIC
GET    /v1/areas                                            listAreas                    PUBLIC
GET    /v1/providers                                        listProviders                PUBLIC
POST   /v1/providers                                        registerProvider             auth
GET    /v1/provider-profile                                 getProviderProfile           auth
PUT    /v1/provider-profile                                 updateProviderProfile        auth
GET    /v1/providers/{slug}                                 getPublicProvider            PUBLIC
GET    /v1/providers/{slug}/opening-hours                   listPublicOpeningHours       PUBLIC```
