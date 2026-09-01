import { Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, Scene } from "@/components/icon";
import { Avatar, Wordmark } from "@/components/ui";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";
import { ApiError, publicApi } from "@/lib/api";
import { mediaUrl, money, time } from "@/lib/format";
import type {
  AreaList,
  AvailableSlotPage,
  CustomerBooking,
  Fulfilment,
  LocalityList,
  PublicProvider,
  PublicServiceOffering,
  PublicStaffList,
  PublicStaffMember,
} from "@/lib/types";
import { groupLocalities, localityLabel } from "@/lib/localities";
import { book } from "./actions";

/** Live availability. Cached, this sends a customer to a slot that is gone. */
export const dynamic = "force-dynamic";

export const metadata = { title: "Réserver" };

/**
 * The five questions, in the order a customer answers them.
 *
 * <p>One route, five positions in the URL. `?etape=&service=&staff=&date=&time=`
 * is the whole state of the flow, which is what makes the back button work:
 * going back a step is going back a URL, and a customer who reloads at the
 * fourth step is still at the fourth step with the same day. A wizard holding
 * its answers in memory loses all of them to a phone that reclaims a tab.
 */
const STEPS = ["Prestation", "Personne", "Date", "Horaire", "Coordonnées"] as const;

/** The confirmation, which is a sixth position and not a sixth question. */
const CONFIRMATION = 6;

/**
 * Why the booking was refused, in words the customer can act on.
 *
 * <p>Keyed by the contract's own closed catalogue. Anything outside it is a
 * code this client has not been taught, and it gets the general sentence
 * rather than a guess at what the server meant.
 */
const REFUSALS: Record<string, string> = {
  SLOT_UNAVAILABLE:
    "Ce créneau vient d'être pris par quelqu'un d'autre. Les horaires ci-dessous sont à jour : choisissez-en un autre.",
  SLOT_OUTSIDE_AVAILABILITY:
    "Ce créneau n'est plus proposé par le professionnel. Choisissez-en un dans la liste ci-dessous, qui vient d'être rechargée.",
  VALIDATION_FAILED:
    "Vérifiez le nom et le numéro de téléphone : le professionnel a besoin des deux pour vous accueillir.",
  RATE_LIMITED:
    "Plusieurs personnes ont demandé ce créneau en même temps. Patientez quelques secondes et confirmez à nouveau.",
  RESOURCE_NOT_FOUND:
    "Cette prestation n'est plus proposée. Revenez à la première étape pour en choisir une autre.",
};

/**
 * The refusal, in one sentence.
 *
 * <p>An address that is owed and missing answers `VALIDATION_FAILED`, which is
 * the same code a missing telephone answers: the catalogue is closed and has no
 * entry that separates them. The offering is what tells them apart here,
 * because only a call-out was ever asked for an address in the first place.
 */
function refusalText(code: string, service: PublicServiceOffering | undefined): string {
  if (code === "VALIDATION_FAILED" && service?.fulfilment === "AT_CUSTOMER") {
    return "Vérifiez le nom, le numéro de téléphone et les indications pour vous trouver : le professionnel a besoin des trois pour se déplacer.";
  }
  return (
    REFUSALS[code] ??
    "Le professionnel n'a pas pu enregistrer ce rendez-vous. Réessayez, ou appelez-le directement."
  );
}

/**
 * How many days of slots are read at once.
 *
 * <p>A week, because a customer who cannot come tomorrow wants to see Saturday
 * without a round trip, and because the contract truncates a range longer than
 * thirty-one days - so the number has to be one this client chose rather than
 * one the server silently corrected.
 */
const WINDOW_DAYS = 7;

/** Where the morning ends. Both mocked salons break for lunch before it. */
const AFTERNOON = 13 * 60;

/** A date as the contract writes one, and as this page puts one in a URL. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Search = {
  etape?: string;
  service?: string;
  staff?: string;
  date?: string;
  time?: string;
  ref?: string;
  error?: string;
};

export default async function BookingFlow({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { provider, staff } = await loadProvider(slug);

  // A service named by a URL that no longer names one is not an error worth a
  // page: the offering was withdrawn, and the customer belongs at step one.
  const service = provider.services.find(
    (one) => one.service_offering_id === query.service,
  );
  const person = staff.data.find((one) => one.staff_id === query.staff);
  const hasTeam = staff.data.length > 0;

  const zone = provider.timezone;
  // Today where the salon is, not where this process runs. `from` and `to` are
  // dates in the provider's own zone by the contract's own words, and a server
  // in Paris would otherwise start the week a day early for half of every day.
  const today = calendarDay(new Date(), zone);
  const day =
    query.date && DATE.test(query.date) && query.date >= today ? query.date : undefined;
  // The instant the customer tapped, carried whole. It is the value the slot
  // list minted; nothing here reads a wall clock, so nothing here converts one.
  const slotAt =
    query.time && !Number.isNaN(Date.parse(query.time)) ? query.time : undefined;

  const step = resolveStep(query, service !== undefined, hasTeam, day, slotAt);

  // The confirmation is not a step of the form: full site chrome, no progress
  // bar, no recap. It reads the appointment back by the one handle a customer
  // without an account has.
  if (step === CONFIRMATION) {
    return (
      <Confirmation
        provider={provider}
        booking={await loadBooking(query.ref ?? "")}
        service={service}
      />
    );
  }

  const from = day ?? today;
  const to = addDays(from, WINDOW_DAYS - 1);

  const [slots, places] = await Promise.all([
    // Only once a service is chosen, and only on the steps that show them: a
    // slot's length comes from that offering's own duration and buffers, so
    // there is no such thing as the slot list of a provider in general.
    (step === 3 || step === 4) && service
      ? publicApi<AvailableSlotPage>(
          `/v1/providers/${encodeURIComponent(slug)}/available-slots`,
          {
            query: {
              service_offering_id: service.service_offering_id,
              // Absent unless the customer asked for someone. Sent, it is a
              // question about one person; omitted, about the whole team.
              staff_id: person?.staff_id,
              from,
              to,
              limit: 200,
            },
          },
        )
      : null,
    // The map and the quartiers, read only when the form is going to ask for
    // an address. Every other booking happens where the business already is.
    step === 5 && service?.fulfilment === "AT_CUSTOMER"
      ? loadPlaces(provider.locality?.slug)
      : null,
  ]);

  // The response is a flat list of instants across the whole range. A customer
  // reads a day at a time, so they are bucketed by the provider's own calendar
  // day - the day it is at the salon, which is the only day that matters here.
  const groups = slots ? groupByDay(slots.data, zone) : [];

  // A step nobody will be shown is a step nobody should be told they passed:
  // with no bookable team, "avec qui" never happens and the progress bar says
  // four, not five with a second one mysteriously ticked.
  const labels = hasTeam ? [...STEPS] : [STEPS[0], STEPS[2], STEPS[3], STEPS[4]];
  const current = hasTeam || step === 1 ? step : step - 1;

  const refusal = query.error ? (
    <div style={{ marginTop: "var(--s-5)" }}>
      <div className="alert alert--danger" role="alert" data-error-code={query.error}>
        <span className="alert__icon">
          <Icon name="alert-circle" />
        </span>
        <div className="grow">
          <div className="alert__title">La réservation n'a pas abouti</div>
          <div className="alert__body">{refusalText(query.error, service)}</div>
        </div>
      </div>
    </div>
  ) : null;

  let content: ReactNode;
  if (step === 5 && service && day && slotAt) {
    content = (
      <DetailsStep
        slug={slug}
        provider={provider}
        service={service}
        person={person}
        day={day}
        slotAt={slotAt}
        places={places}
        labels={labels}
        current={current}
      />
    );
  } else if (step === 4 && service && day) {
    content = (
      <TimeStep
        slug={slug}
        service={service}
        person={person}
        day={day}
        chosen={slotAt}
        slots={groups.find((group) => group.date === day)?.slots ?? []}
        zone={zone}
        labels={labels}
        current={current}
        refusal={refusal}
      />
    );
  } else if (step === 3 && service) {
    content = (
      <DateStep
        slug={slug}
        service={service}
        person={person}
        groups={groups}
        active={day}
        from={from}
        to={to}
        today={today}
        hasTeam={hasTeam}
        truncated={Boolean(slots?.next_cursor)}
        labels={labels}
        current={current}
      />
    );
  } else if (step === 2) {
    content = (
      <StaffStep
        slug={slug}
        service={query.service ?? ""}
        staff={staff}
        chosen={query.staff}
        labels={labels}
      />
    );
  } else {
    content = (
      <ServiceStep slug={slug} provider={provider} hasTeam={hasTeam} labels={labels} refusal={refusal} />
    );
  }

  return (
    <>
      <header className="hdr">
        <div className="page hdr__in">
          <Wordmark size={34} />
          <div className="hdr__actions">
            <Link className="hdr__link" href={`/p/${encodeURIComponent(slug)}`}>
              Quitter
            </Link>
            <span className="t-xs" style={{ display: "none" }} data-show-md>
              Besoin d’aide{"\u00A0"}?{" "}
              <Link
                className="link"
                href="/professionnels/comment-ca-marche"
                style={{ marginLeft: ".25rem" }}
              >
                Comment ça marche
              </Link>
            </span>
          </div>
        </div>
      </header>

      <main id="contenu">
        <div
          className="page"
          style={{ paddingBlock: "var(--s-6) var(--s-16)", maxWidth: "1080px" }}
        >
          <div style={{ marginBottom: "var(--s-6)" }}>
            <Steps labels={labels} current={current} />
          </div>

          <div className="cols cols--main-aside" style={{ gap: "var(--s-8)" }}>
            <div>{content}</div>
            <aside className="sticky-aside">
              <Recap
                provider={provider}
                service={service}
                person={person}
                step={step}
                hasTeam={hasTeam}
                day={day}
                slotAt={slotAt}
                zone={zone}
              />
              <p
                className="t-xs"
                style={{
                  marginTop: "var(--s-4)",
                  display: "flex",
                  gap: ".5rem",
                  alignItems: "flex-start",
                }}
              >
                <Icon name="lock" size={16} />
                <span>
                  Aucun compte n’est créé. Votre numéro sert uniquement à ce
                  rendez-vous et reste chez {provider.business_name}.
                </span>
              </p>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

/* --- Step 1: the service ------------------------------------------------- */

function ServiceStep({
  slug,
  provider,
  hasTeam,
  labels,
  refusal,
}: {
  slug: string;
  provider: PublicProvider;
  hasTeam: boolean;
  labels: readonly string[];
  refusal: ReactNode;
}) {
  // Nobody is published as bookable, so "avec qui" has a single answer and
  // asking it would be a screen the customer taps through. Skip to the days.
  const next = hasTeam ? 2 : 3;

  return (
    <>
      <p className="t-overline">Étape 1 sur {labels.length}</p>
      <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
        Quelle prestation ?
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)", maxWidth: "58ch" }}>
        Le prix affiché sera figé au moment de la réservation.
      </p>
      {refusal}

      <div style={{ marginTop: "var(--s-6)" }}>
        {provider.services.length === 0 ? (
          <div className="empty empty--tight">
            <Scene name="notebook" className="scene-ill scene-ill--sm" />
            <div className="empty__title">Rien à réserver pour l’instant</div>
            <p className="empty__body">
              Ce professionnel n’a pas encore publié de prestation. Sa page
              indique comment le joindre.
            </p>
            <div className="empty__actions">
              <Link
                className="btn btn--secondary"
                href={`/p/${encodeURIComponent(slug)}`}
              >
                <span className="btn__label--idle">Retour à la page</span>
              </Link>
            </div>
          </div>
        ) : (
          provider.services.map((one) => {
            const photo = mediaUrl(one.photos?.[0]);
            return (
              <Link
                key={one.service_offering_id}
                className="svc"
                style={{ textDecoration: "none", color: "inherit" }}
                href={stepHref(slug, { etape: next, service: one.service_offering_id })}
              >
                <div className="svc__photo">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" loading="lazy" />
                  ) : (
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        height: "100%",
                        color: "var(--p-warm-400)",
                      }}
                    >
                      <Icon name="image" size={24} />
                    </span>
                  )}
                </div>
                <div className="grow">
                  <h2 className="svc__name">{one.name}</h2>
                  {one.description ? (
                    <p className="svc__desc">{one.description}</p>
                  ) : null}
                  <div className="svc__facts">
                    <ModeBadge fulfilment={one.fulfilment} />
                    {/* Only a drop-off carries one, which is what makes it a
                        drop-off: the server derives the fulfilment from this
                        very field. */}
                    {one.turnaround_hours ? (
                      <span className="fact fact--strong">
                        <Icon name="hourglass" />
                        Prêt sous {turnaround(one.turnaround_hours)}
                      </span>
                    ) : null}
                    <span className="fact">
                      <Icon name="clock" />
                      {one.fulfilment === "DROP_OFF"
                        ? `Remise ${duration(one.duration_minutes)}`
                        : duration(one.duration_minutes)}
                    </span>
                  </div>
                </div>
                <div className="svc__cta">
                  {/* A price the provider chose not to publish is absent from
                      the projection entirely - not zero, not null - so there is
                      nothing to print and no "prix non communiqué" to invent. */}
                  {one.price ? <span className="t-price">{money(one.price)}</span> : null}
                  <span className="btn btn--secondary">
                    Choisir <Icon name="chevron-right" size={18} />
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}

/* --- Step 2: the person -------------------------------------------------- */

/**
 * Radios and a button rather than links.
 *
 * <p>The form is a GET to this same route, so the answer still ends up in the
 * URL and the back button still works - the difference is that "peu importe"
 * is a choice the customer sees selected, which a grid of links cannot show.
 * Nothing here runs in the browser.
 */
function StaffStep({
  slug,
  service,
  staff,
  chosen,
  labels,
}: {
  slug: string;
  service: string;
  staff: PublicStaffList;
  chosen: string | undefined;
  labels: readonly string[];
}) {
  const named = staff.data.some((one) => one.staff_id === chosen);

  return (
    <>
      <p className="t-overline">Étape 2 sur {labels.length}</p>
      <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
        Avec qui ?
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)", maxWidth: "58ch" }}>
        Vous pouvez laisser le salon choisir : cela ouvre davantage de créneaux.
      </p>

      <form method="get" style={{ marginTop: "var(--s-6)" }}>
        {/* The rest of the position, which a GET form would otherwise drop:
            the browser replaces the whole query string with these fields. */}
        <input type="hidden" name="etape" value="3" />
        <input type="hidden" name="service" value={service} />

        <div className="choice-grid" data-reveal-group="staff">
          <label className="choice">
            <input type="radio" name="staff" value="" defaultChecked={!named} />
            <span className="choice__mark">
              <Icon name="check-circle" />
            </span>
            <span className="choice__head">
              <span className="choice__icon">
                <Icon name="users" />
              </span>
              <span>
                <span className="choice__title">Peu importe</span>
                <span className="choice__desc" style={{ marginTop: 0 }}>
                  La première personne disponible
                </span>
              </span>
            </span>
          </label>

          {staff.data.map((one) => (
            <label className="choice" key={one.staff_id}>
              <input
                type="radio"
                name="staff"
                value={one.staff_id}
                defaultChecked={one.staff_id === chosen}
              />
              <span className="choice__mark">
                <Icon name="check-circle" />
              </span>
              <span className="choice__head">
                <Avatar name={one.display_name} />
                <span>
                  <span className="choice__title">{one.display_name}</span>
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="row" style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}>
          <Link className="btn btn--ghost" href={stepHref(slug, { etape: 1 })}>
            <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
              <Icon name="arrow-left" size={18} />
            </span>
            <span className="btn__label--idle">Retour</span>
          </Link>
          <span className="toolbar__spacer grow" />
          <button className="btn btn--primary" type="submit">
            <span className="btn__label--idle">Continuer</span>
            <Icon name="arrow-right" size={18} className="ico--arrow" />
          </button>
        </div>
      </form>
    </>
  );
}

/* --- Step 3: the day ----------------------------------------------------- */

function DateStep({
  slug,
  service,
  person,
  groups,
  active,
  from,
  to,
  today,
  hasTeam,
  truncated,
  labels,
  current,
}: {
  slug: string;
  service: PublicServiceOffering;
  person: PublicStaffMember | undefined;
  groups: { date: string; slots: Slot[] }[];
  active: string | undefined;
  from: string;
  to: string;
  today: string;
  hasTeam: boolean;
  truncated: boolean;
  labels: readonly string[];
  current: number;
}) {
  const week = (date: string) =>
    stepHref(slug, {
      etape: 3,
      service: service.service_offering_id,
      staff: person?.staff_id,
      date,
    });
  const nextWeek = week(addDays(from, WINDOW_DAYS));

  return (
    <>
      <p className="t-overline">
        Étape {current} sur {labels.length}
      </p>
      <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
        Quel jour ?
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)", maxWidth: "58ch" }}>
        Seuls les jours où il reste de la place sont proposés.
      </p>

      <div style={{ marginTop: "var(--s-6)" }}>
        <div className="row row--between" style={{ marginBottom: "var(--s-4)" }}>
          <span className="t-strong">{windowLabel(from, to)}</span>
          <span className="row" style={{ gap: "var(--s-1)" }}>
            {/* Absent rather than dead at the start of the window: a control
                that answers with the page it is on is worse than none. */}
            {from > today ? (
              <Link
                className="btn btn--ghost btn--sm btn--icon"
                aria-label="Semaine précédente"
                href={week(laterOf(today, addDays(from, -WINDOW_DAYS)))}
              >
                <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                  <Icon name="chevron-left" size={18} />
                </span>
              </Link>
            ) : null}
            <Link
              className="btn btn--ghost btn--sm btn--icon"
              aria-label="Semaine suivante"
              href={nextWeek}
            >
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="chevron-right" size={18} />
              </span>
            </Link>
          </span>
        </div>

        {groups.length > 0 ? (
          <>
            <div className="daystrip">
              {groups.map((group) => (
                <Link
                  key={group.date}
                  className={group.date === active ? "day is-active" : "day"}
                  aria-current={group.date === active ? "true" : undefined}
                  href={stepHref(slug, {
                    etape: 4,
                    service: service.service_offering_id,
                    staff: person?.staff_id,
                    date: group.date,
                  })}
                >
                  <span className="day__dow">{dayOfWeek(group.date)}</span>
                  <span className="day__num">{dayNumber(group.date)}</span>
                  <span className="day__free">
                    {group.slots.length} libre{group.slots.length > 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
            </div>
            <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
              <Icon name="info" size={16} /> Les jours de fermeture et les congés
              du salon n’apparaissent pas.
            </p>
            {truncated ? (
              <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
                Cette semaine compte plus de créneaux que la page n’en montre.
                Les jours suivants en ont d’autres.
              </p>
            ) : null}
          </>
        ) : (
          <div className="empty empty--tight">
            <Scene name="chair" className="scene-ill scene-ill--sm" />
            <div className="empty__title">Rien de libre cette semaine</div>
            <p className="empty__body">
              {person
                ? `${person.display_name} n’a plus de place du ${dayLabel(from)} au ${dayLabel(to)}. La semaine suivante est souvent plus ouverte, ou revenez à l’étape précédente pour ne demander personne en particulier.`
                : `Tout est pris du ${dayLabel(from)} au ${dayLabel(to)}. Essayez la semaine suivante.`}
            </p>
            <div className="empty__actions">
              <Link className="btn btn--secondary" href={nextWeek}>
                <span className="btn__label--idle">Voir la semaine suivante</span>
                <Icon name="chevron-right" size={18} className="ico--arrow" />
              </Link>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: "var(--s-8)" }}>
          <Link
            className="btn btn--ghost"
            href={stepHref(slug, {
              etape: hasTeam ? 2 : 1,
              service: service.service_offering_id,
              staff: person?.staff_id,
            })}
          >
            <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
              <Icon name="arrow-left" size={18} />
            </span>
            <span className="btn__label--idle">Retour</span>
          </Link>
        </div>
      </div>
    </>
  );
}

/* --- Step 4: the hour ---------------------------------------------------- */

/**
 * The hours of one day, and where a refusal lands.
 *
 * <p>A slot taken while the customer was typing comes back here rather than to
 * the form they were on: the list below has just been re-read, so the sentence
 * "les créneaux ci-dessous sont à jour" is true when it is printed.
 */
function TimeStep({
  slug,
  service,
  person,
  day,
  chosen,
  slots,
  zone,
  labels,
  current,
  refusal,
}: {
  slug: string;
  service: PublicServiceOffering;
  person: PublicStaffMember | undefined;
  day: string;
  chosen: string | undefined;
  slots: Slot[];
  zone: string;
  labels: readonly string[];
  current: number;
  refusal: ReactNode;
}) {
  const morning = slots.filter((slot) => minutesOfDay(slot.starts_at, zone) < AFTERNOON);
  const afternoon = slots.filter(
    (slot) => minutesOfDay(slot.starts_at, zone) >= AFTERNOON,
  );

  const tile = (slot: Slot) => (
    <Link
      key={slot.starts_at}
      className={slot.starts_at === chosen ? "slot is-selected" : "slot"}
      aria-current={slot.starts_at === chosen ? "true" : undefined}
      href={stepHref(slug, {
        etape: 5,
        service: service.service_offering_id,
        staff: person?.staff_id,
        date: day,
        time: slot.starts_at,
      })}
    >
      {time(slot.starts_at, zone)}
    </Link>
  );

  return (
    <>
      <p className="t-overline">
        Étape {current} sur {labels.length}
      </p>
      <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
        Quel horaire, {dayLabel(day)} ?
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)", maxWidth: "58ch" }}>
        Seuls les créneaux réservables sont affichés. Ce qui est déjà pris n’est
        pas publié.
      </p>
      {refusal}

      <div style={{ marginTop: "var(--s-6)" }}>
        {/* Above the hours, where the mockup put it: on a drop-off the sentence
            changes what the times below mean, and a customer who reads the
            handover as the length of the work comes back to a workshop that
            has not started. */}
        {service.fulfilment === "DROP_OFF" ? (
          <div style={{ marginBottom: "var(--s-6)" }}>
            <ModeNote service={service} />
          </div>
        ) : null}

        {slots.length > 0 ? (
          <>
            {morning.length > 0 ? (
              <div className="slots__group">
                <div className="slots__label">
                  <Icon name="sun" size={16} /> Matin
                </div>
                <div className="slots">{morning.map(tile)}</div>
              </div>
            ) : null}
            {afternoon.length > 0 ? (
              <div className="slots__group">
                <div className="slots__label">
                  <Icon name="clock" size={16} /> Après-midi
                </div>
                <div className="slots">{afternoon.map(tile)}</div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty empty--tight">
            <Scene name="chair" className="scene-ill scene-ill--sm" />
            <div className="empty__title">Plus rien de libre ce jour-là</div>
            <p className="empty__body">
              Les créneaux de {dayLabel(day)} sont tous pris. Choisissez un autre
              jour : la liste est à jour.
            </p>
          </div>
        )}

        <div className="row" style={{ marginTop: "var(--s-8)" }}>
          <Link
            className="btn btn--ghost"
            href={stepHref(slug, {
              etape: 3,
              service: service.service_offering_id,
              staff: person?.staff_id,
              date: day,
            })}
          >
            <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
              <Icon name="arrow-left" size={18} />
            </span>
            <span className="btn__label--idle">Changer de jour</span>
          </Link>
        </div>
      </div>
    </>
  );
}

/* --- Step 5: who is booking ---------------------------------------------- */

function DetailsStep({
  slug,
  provider,
  service,
  person,
  day,
  slotAt,
  places,
  labels,
  current,
}: {
  slug: string;
  provider: PublicProvider;
  service: PublicServiceOffering;
  person: PublicStaffMember | undefined;
  day: string;
  slotAt: string;
  places: Places | null;
  labels: readonly string[];
  current: number;
}) {
  return (
    <>
      <p className="t-overline">
        Étape {current} sur {labels.length}
      </p>
      <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
        Vos coordonnées
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)", maxWidth: "58ch" }}>
        Elles servent au prestataire pour vous reconnaître et vous prévenir.
        Rien de plus.
      </p>

      <form action={book} className="stack" style={{ marginTop: "var(--s-6)" }}>
        <input type="hidden" name="slug" value={slug} />
        <input
          type="hidden"
          name="service_offering_id"
          value={service.service_offering_id}
        />
        {/* Rendered only when someone was asked for. An empty field would post
            an empty staff_id, and the contract's answer to "nobody in
            particular" is an absent field, never a null. */}
        {person ? <input type="hidden" name="staff_id" value={person.staff_id} /> : null}
        {/* The hour chosen at the step before, carried whole. */}
        <input type="hidden" name="starts_at" value={slotAt} />
        {/* The day being shown, so a refusal comes back to this same day. */}
        <input type="hidden" name="date" value={day} />

        <div className="panel">
          <div className="panel__head">
            <div>
              <div className="panel__title">Qui réserve</div>
            </div>
          </div>
          <div className="card__body">
            <div className="field">
              <label className="field__label" htmlFor="bk-name">
                Nom et prénom{" "}
                <span className="field__req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="input"
                type="text"
                id="bk-name"
                name="full_name"
                placeholder="Aminata Diallo"
                required
                maxLength={120}
                autoComplete="name"
              />
            </div>

            {/* No "+224" prefix, which the mockup drew. The API normalises the
                number from the PROVIDER's own country, and this page has no
                country to read - printing one dialling code would be right in
                Conakry and wrong the first time a business is anywhere else. */}
            <div className="field">
              <label className="field__label" htmlFor="bk-phone">
                Téléphone{" "}
                <span className="field__req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="input"
                type="tel"
                id="bk-phone"
                name="phone"
                placeholder="622 00 00 00"
                required
                maxLength={24}
                inputMode="tel"
                autoComplete="tel"
                aria-describedby="bk-phone-hint"
              />
              <p className="field__hint" id="bk-phone-hint">
                Le prestataire vous joindra par WhatsApp sur ce numéro.
              </p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="bk-note">
                Un mot pour le prestataire{" "}
                <span className="field__optional">facultatif</span>
              </label>
              <textarea
                className="textarea"
                id="bk-note"
                name="customer_note"
                maxLength={500}
                placeholder="Je viens avec ma fille de 6 ans, prévoir deux places."
              />
            </div>
          </div>
        </div>

        {/* Where the provider is going, or what happens where they already are.
            The contract refuses an address on anything but a call-out, so the
            block shown always would turn every salon booking into a 422. */}
        {places ? (
          <AddressFields places={places} />
        ) : (
          <div>
            <ModeNote service={service} />
          </div>
        )}

        <div
          className="card card--pad"
          style={{ background: "var(--bg-sunken)", boxShadow: "none" }}
        >
          <label className="check">
            <input type="checkbox" required />
            <span className="check__box">
              <Icon name="check" />
            </span>
            <span className="check__text">
              <strong>
                J’accepte que mon nom et mon numéro soient transmis à{" "}
                {provider.business_name}
              </strong>
              <span>
                Ils sont conservés par ce prestataire, pas par Balaaca. Voir la
                page Confidentialité.
              </span>
            </span>
          </label>
        </div>

        <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
          <Link
            className="btn btn--ghost"
            href={stepHref(slug, {
              etape: 4,
              service: service.service_offering_id,
              staff: person?.staff_id,
              date: day,
              time: slotAt,
            })}
          >
            <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
              <Icon name="arrow-left" size={18} />
            </span>
            <span className="btn__label--idle">Retour</span>
          </Link>
          <span className="grow" />
          <button className="btn btn--primary btn--lg" type="submit">
            <span className="btn__label--idle">
              {service.price
                ? `Confirmer · ${money(service.price)}`
                : "Confirmer la réservation"}
            </span>
          </button>
        </div>

        {service.price ? (
          <p className="t-xs">
            Le prix est figé maintenant. Il ne changera pas, même si le salon
            modifie son tarif ensuite.
          </p>
        ) : null}
      </form>
    </>
  );
}

/**
 * Where the provider is going.
 *
 * <p>Part of the fifth step rather than a sixth one, exactly as the mockup
 * drew it: the address is not a decision the customer makes - it is where they
 * already are - and it replaces the note about the mode rather than joining it.
 *
 * <p>Nothing here asks for a house number or a street, because most of Conakry
 * has neither. The one required field is the sentence a tradesman would ask
 * for on the telephone, and the contract makes it the only required one for
 * the same reason.
 */
function AddressFields({ places }: { places: Places }) {
  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <div className="panel__title">Où le prestataire doit-il se rendre</div>
          <div className="panel__sub">
            Aucune coordonnée GPS n’est demandée ni enregistrée.
          </div>
        </div>
        <ModeBadge fulfilment="AT_CUSTOMER" />
      </div>
      <div className="card__body">
        <div className="cols cols--2" style={{ gap: "var(--s-5)" }}>
          <div className="field">
            <label className="field__label" htmlFor="bk-locality">
              Commune <span className="field__optional">facultatif</span>
            </label>
            {/* No commune pre-selected, not even the one the business sits in. A
                default nobody chose reads on the provider's agenda exactly like
                an answer the customer gave, and it is wrong the first time a
                plumber in Ratoma is called out to Matoto. */}
            <select className="select" id="bk-locality" name="locality_slug" defaultValue="">
              <option value="">Choisir</option>
              {groupLocalities(places.localities.data).map(({ region, children }) => (
                <optgroup key={region.slug} label={region.label_fr}>
                  {children.map((l) => (
                    <option key={l.slug} value={l.slug}>
                      {localityLabel(l)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="bk-area">
              Quartier <span className="field__optional">facultatif</span>
            </label>
            {/* Free text with suggestions, like the hub's own: the quartiers of
                Guinea run into the thousands and this platform does not write
                them, so the list proposes what exists without refusing the rest
                - which is exactly what the server accepts. */}
            <input
              className="input"
              type="text"
              id="bk-area"
              name="area"
              placeholder="Nongo"
              list="bk-quartiers"
              maxLength={80}
              autoComplete="off"
            />
            <p className="field__hint">Saisie libre.</p>
          </div>
        </div>

        <datalist id="bk-quartiers">
          {places.areas.data.map((a) => (
            <option key={a.label} value={a.label} />
          ))}
        </datalist>

        <div className="field">
          <label className="field__label" htmlFor="bk-directions">
            Comment vous trouver{" "}
            <span className="field__req" aria-hidden="true">
              *
            </span>
          </label>
          <textarea
            className="textarea"
            id="bk-directions"
            name="directions"
            required
            maxLength={500}
            placeholder="Derrière la mosquée de Nongo, portail bleu, deuxième maison à gauche."
            aria-describedby="bk-directions-hint"
          />
          <p className="field__hint" id="bk-directions-hint">
            Obligatoire : c’est ce qui permet au prestataire d’arriver chez vous.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --- The confirmation ---------------------------------------------------- */

/**
 * The appointment, read back by its reference.
 *
 * <p>The whole site's chrome and no progress bar: the flow is over, and what
 * the customer needs now is the eight characters that let them come back.
 */
function Confirmation({
  provider,
  booking,
  service,
}: {
  provider: PublicProvider;
  booking: CustomerBooking;
  service: PublicServiceOffering | undefined;
}) {
  const zone = booking.timezone;
  const whatsapp = provider.whatsapp_phone_e164?.replace(/\D/g, "");

  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section
          className="section section--lg atmo tex-halo"
          style={{ paddingBlock: "var(--s-12)" }}
        >
          <svg className="wm wm--tr wm--gold" viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-check-circle" />
          </svg>
          <div className="page page--narrow">
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                textAlign: "center",
                gap: "var(--s-5)",
              }}
            >
              <div className="tick tick--lg">
                <Icon name="check" size={32} />
              </div>
              <h1 className="t-h1">C’est réservé.</h1>
              <p className="t-lead" style={{ maxWidth: "44ch" }}>
                {booking.provider_name} a reçu votre demande. Vous recevrez un
                message WhatsApp dès qu’elle sera confirmée.
              </p>
            </div>

            <div className="card" style={{ marginTop: "var(--s-10)" }}>
              <div className="card__head" style={{ alignItems: "center" }}>
                <div>
                  <div className="t-overline">Votre référence</div>
                  <div className="ref" style={{ marginTop: "var(--s-2)" }}>
                    {spacedReference(booking.reference)}
                  </div>
                </div>
                <button
                  className="btn btn--secondary"
                  type="button"
                  data-copy={booking.reference}
                >
                  <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                    <Icon name="copy" size={18} />
                  </span>
                  <span className="btn__label--idle">Copier</span>
                </button>
              </div>

              <div className="card__body">
                <div className="dl dl--lined">
                  <div className="dl__row">
                    <span className="dl__key">Prestation</span>
                    <span className="dl__val">{booking.service_name}</span>
                  </div>
                  <div className="dl__row">
                    <span className="dl__key">Chez</span>
                    <span className="dl__val">{booking.provider_name}</span>
                  </div>
                  <div className="dl__row">
                    <span className="dl__key">Quand</span>
                    <span className="dl__val">{whenLabel(booking.starts_at, zone)}</span>
                  </div>
                  <div className="dl__row">
                    <span className="dl__key">Avec</span>
                    <span className="dl__val">{booking.staff_name}</span>
                  </div>
                  <div className="dl__row">
                    <span className="dl__key">Prix figé</span>
                    <span className="dl__val t-price">{money(booking.price)}</span>
                  </div>
                  {service ? (
                    <div className="dl__row">
                      <span className="dl__key">Déroulement</span>
                      <span className="dl__val">
                        <ModeBadge fulfilment={service.fulfilment} large />
                      </span>
                    </div>
                  ) : null}
                </div>

                {service ? (
                  <div style={{ marginTop: "var(--s-6)" }}>
                    <ModeNote service={service} />
                  </div>
                ) : null}
              </div>

              <div className="card__foot">
                <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
                  <Link
                    className="btn btn--primary"
                    href={`/bookings/${encodeURIComponent(booking.reference)}`}
                  >
                    <span className="btn__label--idle">Voir ma réservation</span>
                    <Icon name="arrow-right" size={18} className="ico--arrow" />
                  </Link>
                  <button className="btn btn--secondary" type="button">
                    <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                      <Icon name="calendar" size={18} />
                    </span>
                    <span className="btn__label--idle">Ajouter à mon agenda</span>
                  </button>
                  {whatsapp ? (
                    <a className="btn btn--ghost" href={`https://wa.me/${whatsapp}`}>
                      <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                        <Icon name="whatsapp" size={18} />
                      </span>
                      <span className="btn__label--idle">Écrire au salon</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            <div style={{ marginTop: "var(--s-6)" }}>
              <div className="alert alert--info" role="status">
                <span className="alert__icon">
                  <Icon name="info" />
                </span>
                <div className="grow">
                  <div className="alert__title">Notez cette référence</div>
                  <div className="alert__body">
                    Huit caractères, faciles à dicter au téléphone. Elle vous
                    sert à déplacer ou annuler le rendez-vous. C’est la seule
                    chose à conserver : il n’y a pas de compte.
                  </div>
                </div>
              </div>
            </div>

            <p className="t-sm" style={{ textAlign: "center", marginTop: "var(--s-8)" }}>
              <Link
                className="link"
                href={`/p/${encodeURIComponent(booking.provider_slug)}`}
              >
                Retour à la page de {booking.provider_name}
              </Link>{" "}
              ·{" "}
              <Link className="link" href="/">
                Chercher autre chose
              </Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />

      <TabBar />
    </>
  );
}

/* --- Small pieces -------------------------------------------------------- */

function Steps({ labels, current }: { labels: readonly string[]; current: number }) {
  return (
    <nav className="steps" aria-label="Progression">
      {labels.map((label, i) => {
        const n = i + 1;
        return (
          <Fragment key={label}>
            {n > 1 ? (
              <span
                className={n - 1 < current ? "step__line step__line--done" : "step__line"}
              />
            ) : null}
            <span
              className={
                n < current ? "step step--done" : n === current ? "step step--current" : "step"
              }
              aria-current={n === current ? "step" : undefined}
            >
              <span className="step__dot">
                {n < current ? <Icon name="check" size={16} /> : n}
              </span>
              <span className="step__label">{label}</span>
            </span>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** What has been answered so far, and what the booking will cost. */
function Recap({
  provider,
  service,
  person,
  step,
  hasTeam,
  day,
  slotAt,
  zone,
}: {
  provider: PublicProvider;
  service: PublicServiceOffering | undefined;
  person: PublicStaffMember | undefined;
  step: number;
  hasTeam: boolean;
  day: string | undefined;
  slotAt: string | undefined;
  zone: string;
}) {
  const logo = mediaUrl(provider.logo_url);
  const place = [provider.area, provider.locality?.label_fr].filter(Boolean).join(", ");

  return (
    <div className="recap">
      <div className="recap__head">
        {logo ? (
          <span className="avatar avatar--sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" />
          </span>
        ) : (
          <Avatar name={provider.business_name} size="sm" />
        )}
        <div className="grow">
          <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
            {provider.business_name}
          </div>
          {place ? <div className="t-xs">{place}</div> : null}
        </div>
      </div>

      <div className="recap__body">
        <div className="dl">
          <RecapRow
            label="Prestation"
            value={service ? service.name : "à choisir"}
            pending={!service}
          />
          {hasTeam ? (
            <RecapRow
              label="Personne"
              value={person ? person.display_name : step >= 3 ? "Peu importe" : "à choisir"}
              pending={!person}
            />
          ) : null}
          <RecapRow label="Date" value={day ? dayLabel(day) : "à choisir"} pending={!day} />
          <RecapRow
            label="Horaire"
            value={slotAt ? time(slotAt, zone) : "à choisir"}
            pending={!slotAt}
          />
          {service ? (
            <>
              <RecapRow
                label="Déroulement"
                value={<ModeBadge fulfilment={service.fulfilment} />}
              />
              {service.turnaround_hours ? (
                <RecapRow
                  label="Promesse"
                  value={`Prêt sous ${turnaround(service.turnaround_hours)}`}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {service?.price ? (
        <div className="recap__total">
          <span className="t-sm t-strong">Prix</span>
          <span className="t-price t-price--lg">{money(service.price)}</span>
        </div>
      ) : null}
    </div>
  );
}

function RecapRow({
  label,
  value,
  pending,
}: {
  label: string;
  value: ReactNode;
  pending?: boolean;
}) {
  return (
    <div className="dl__row">
      <span className="dl__key">{label}</span>
      <span className={pending ? "dl__val recap__pending" : "dl__val"}>{value}</span>
    </div>
  );
}

/* --- Fulfilment ---------------------------------------------------------- */

type ModeCopy = {
  slug: string;
  icon: string;
  label: string;
  title: string;
  body: string;
};

/**
 * The three ways a service happens, in the one visual writing the product uses
 * everywhere.
 *
 * <p>Keyed as a plain record and read through {@link modeOf} because the
 * contract says an unknown fulfilment is to be read as ON_SITE: a fourth value
 * shipped one day by the server must draw the salon, not nothing.
 */
const ON_SITE: ModeCopy = {
  slug: "on-site",
  icon: "mode-onsite",
  label: "Sur place",
  title: "Sur place · Vous venez sur place",
  body: "Vous vous rendez chez le prestataire et la prestation est réalisée pendant que vous attendez.",
};

const MODE: Record<string, ModeCopy> = {
  ON_SITE,
  AT_CUSTOMER: {
    slug: "at-customer",
    icon: "mode-atcustomer",
    label: "À domicile",
    title: "À domicile · Le prestataire se déplace",
    body: "Le prestataire se déplace jusqu’à l’adresse que vous indiquez.",
  },
  DROP_OFF: {
    slug: "drop-off",
    icon: "mode-dropoff",
    label: "Dépôt",
    title: "Dépôt · Vous déposez, vous repassez",
    body: "",
  },
};

function modeOf(fulfilment: Fulfilment): ModeCopy {
  return MODE[fulfilment] ?? ON_SITE;
}

function ModeBadge({ fulfilment, large }: { fulfilment: Fulfilment; large?: boolean }) {
  const mode = modeOf(fulfilment);
  return (
    <span className={`mode mode--${mode.slug}${large ? " mode--lg" : ""}`}>
      <Icon name={mode.icon} />
      {mode.label}
    </span>
  );
}

function ModeNote({ service }: { service: PublicServiceOffering }) {
  const mode = modeOf(service.fulfilment);
  return (
    <div className={`mode-note mode-note--${mode.slug}`}>
      <span className="mode-note__icon">
        <Icon name={mode.icon} size={24} />
      </span>
      <div>
        <div className="mode-note__title">{mode.title}</div>
        <div className="mode-note__body">
          {service.fulfilment === "DROP_OFF" ? (
            <>
              Vous déposez l’article, vous repassez le récupérer une fois le
              travail terminé.{" "}
              {service.turnaround_hours ? (
                <strong>Prêt sous {turnaround(service.turnaround_hours)}.</strong>
              ) : (
                "Le prestataire vous dira quand revenir le chercher."
              )}{" "}
              Le rendez-vous ci-dessus n’est que la remise au comptoir (
              {duration(service.duration_minutes)}), ce n’est pas la durée du
              travail.
            </>
          ) : (
            mode.body
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Reads --------------------------------------------------------------- */

/** The page and its bookable people, or the 404 an unknown slug deserves. */
async function loadProvider(
  slug: string,
): Promise<{ provider: PublicProvider; staff: PublicStaffList }> {
  try {
    const [provider, staff] = await Promise.all([
      publicApi<PublicProvider>(`/v1/providers/${encodeURIComponent(slug)}`),
      publicApi<PublicStaffList>(`/v1/providers/${encodeURIComponent(slug)}/staff`),
    ]);
    return { provider, staff };
  } catch (error) {
    // An unpublished provider and a slug that was never taken answer the same
    // 404, and so does this page: anything else says whether a hidden business
    // exists.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

/** The appointment behind a reference, for the confirmation. */
async function loadBooking(reference: string): Promise<CustomerBooking> {
  try {
    return await publicApi<CustomerBooking>(
      `/v1/bookings/${encodeURIComponent(reference)}`,
    );
  } catch (error) {
    // A reference that names nothing and one the contract's pattern rejects
    // outright both name nothing, and a 500 would tell a mistyped character
    // that the product is broken.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
}

type Places = { localities: LocalityList; areas: AreaList };

/**
 * The map, and the quartiers people have already written.
 *
 * <p>The quartiers are narrowed to the PROVIDER's own commune, not to the one
 * the customer picks: the select has no JavaScript behind it, so the list has
 * to be chosen before the page is sent. A tradesman's call-outs are mostly
 * around him, and the field is free text either way - a suggestion that does
 * not fit is one the customer types over.
 */
async function loadPlaces(locality: string | undefined): Promise<Places> {
  const [localities, areas] = await Promise.all([
    publicApi<LocalityList>("/v1/localities"),
    publicApi<AreaList>("/v1/areas", { query: { locality } }),
  ]);
  return { localities, areas };
}

/* --- URL ----------------------------------------------------------------- */

type Position = {
  etape: number;
  service?: string;
  staff?: string;
  date?: string;
  time?: string;
};

/** One position in the flow, written as the URL that restores it. */
function stepHref(slug: string, at: Position): string {
  const query = new URLSearchParams({ etape: String(at.etape) });
  if (at.service) query.set("service", at.service);
  if (at.staff) query.set("staff", at.staff);
  if (at.date) query.set("date", at.date);
  if (at.time) query.set("time", at.time);
  return `/p/${encodeURIComponent(slug)}/reserver?${query.toString()}`;
}

/**
 * Which step the URL actually names.
 *
 * <p>A step is only reachable once the steps before it have an answer, so a
 * hand-typed `?etape=5` with no day is the day screen rather than a crash. The
 * URL is the state, which means the URL is also untrusted input.
 *
 * <p>A refusal is the one case that overrides what was asked for. The server
 * action sends it back with the day it was for and no hour, because the hour
 * is exactly what it refused - so it lands on the hour screen, above a list
 * that has just been re-read.
 */
function resolveStep(
  query: Search,
  hasService: boolean,
  hasTeam: boolean,
  day: string | undefined,
  slotAt: string | undefined,
): 1 | 2 | 3 | 4 | 5 | 6 {
  if (query.ref && Number(query.etape) === CONFIRMATION) return CONFIRMATION;
  if (!hasService) return 1;
  if (query.error && day) return 4;

  const wanted = Number(query.etape);
  if (!Number.isInteger(wanted) || wanted <= 1) return 1;
  if (wanted >= 5 && day && slotAt) return 5;
  if (wanted >= 4 && day) return 4;
  if (wanted >= 3) return 3;
  return hasTeam ? 2 : 3;
}

/* --- Dates and durations ------------------------------------------------- */

type Slot = AvailableSlotPage["data"][number];

/** The slots of one range, split into the days they fall on at the salon. */
function groupByDay(slots: Slot[], timeZone: string): { date: string; slots: Slot[] }[] {
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    const date = calendarDay(new Date(slot.starts_at), timeZone);
    const known = byDay.get(date);
    if (known) known.push(slot);
    else byDay.set(date, [slot]);
  }
  // Sorted rather than trusted in arrival order: the contract promises which
  // slots come back, not in which order.
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => ({
      date,
      slots: [...group].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    }));
}

/** The calendar day an instant falls on, in a named zone. */
function calendarDay(instant: Date, timeZone: string): string {
  // en-CA is ISO 8601 by default, which is exactly what the contract's date
  // parameters take.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** How far into the salon's own day an instant falls, in minutes. */
function minutesOfDay(instant: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return at("hour") * 60 + at("minute");
}

/** Days added to a date, both written the way the contract writes a date. */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The later of two dates, so a "previous week" never lands in the past. */
function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * A date, for a reader.
 *
 * <p>Read and written in UTC on purpose: a date has no zone, and the string
 * being formatted is already the day it is at the salon. Formatting it in any
 * other zone would move it by one.
 */
function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("fr", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** An instant as the confirmation reads it: the day at the salon, then the hour. */
function whenLabel(instant: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat("fr", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(instant));
  return `${date} à ${time(instant, timeZone)}`;
}

/**
 * The reference, in two halves.
 *
 * <p>Eight characters read back over a bad line one group at a time. Anything
 * that is not eight is printed whole rather than cut somewhere arbitrary.
 */
function spacedReference(reference: string): string {
  return reference.length === 8
    ? `${reference.slice(0, 4)} ${reference.slice(4)}`
    : reference;
}

/** Minutes as a provider writes them: "45 min", "1 h", "1 h 30". */
function duration(minutes: number): string {
  // A plain space, as the mockup sets one: "3 h", "1 h 15".
  const gap = " ";
  if (minutes < 60) return `${minutes}${gap}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours}${gap}h`
    : `${hours}${gap}h${gap}${String(rest).padStart(2, "0")}`;
}

/**
 * A promise a customer can plan around.
 *
 * <p>Whole days are written as days: "prêt sous 72 h" is arithmetic the
 * customer has to do before knowing whether they can wait, and "sous 3 jours"
 * is not. A week is written as a week, which is how the mockup wrote seven
 * days. Anything that is not a round day stays in hours, because rounding a
 * promise the provider made is not this page's decision.
 */
function turnaround(hours: number): string {
  const gap = " ";
  if (hours === 168) return `1${gap}semaine`;
  return hours >= 24 && hours % 24 === 0
    ? `${hours / 24}${gap}jour${hours === 24 ? "" : "s"}`
    : `${hours}${gap}h`;
}

/**
 * The month the shown week falls in, or both when it straddles two.
 *
 * <p>Written in UTC and capitalised by hand for the same reason {@link
 * dayLabel} is: the string is already the day it is at the salon, and French
 * writes its months in lower case wherever they are not opening a line.
 */
function windowLabel(from: string, to: string): string {
  const month = (date: string) =>
    new Intl.DateTimeFormat("fr", { month: "long", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );
  const year = new Intl.DateTimeFormat("fr", { year: "numeric", timeZone: "UTC" }).format(
    new Date(`${to}T00:00:00Z`),
  );
  const first = month(from);
  const last = month(to);
  const span = first === last ? first : `${first} – ${last}`;
  return `${span.charAt(0).toUpperCase()}${span.slice(1)} ${year}`;
}

/** "lun.", "mar." - the abbreviation the day strip is 76 pixels wide for. */
function dayOfWeek(date: string): string {
  return new Intl.DateTimeFormat("fr", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function dayNumber(date: string): string {
  return new Intl.DateTimeFormat("fr", { day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
