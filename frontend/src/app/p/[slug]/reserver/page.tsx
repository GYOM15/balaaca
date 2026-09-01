import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, Scene } from "@/components/icon";
import { Avatar } from "@/components/ui";
import { ApiError, publicApi } from "@/lib/api";
import { mediaUrl, money, time } from "@/lib/format";
import type {
  AreaList,
  AvailableSlotPage,
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
 * The three questions, in the order a customer answers them.
 *
 * <p>The second one is the whole point of this flow existing as three screens
 * rather than one form. Asking for a person by name is a different booking
 * from taking whatever is free, and a select buried between a service and a
 * date never reads as a question at all.
 *
 * <p>Three where the mockup drew five: it split the slot into a day, an hour
 * and a details screen, and this flow takes all three in one submission - the
 * slot travels with the name and the telephone because a slot chosen and not
 * confirmed is a slot nobody took.
 */
const STEPS = ["Prestation", "Personne", "Créneau"] as const;

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

/** A date as the contract writes one, and as this page puts one in a URL. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Search = {
  etape?: string;
  service?: string;
  staff?: string;
  date?: string;
  error?: string;
};

/**
 * Booking, in three steps carried entirely by the URL.
 *
 * <p>`?etape=&service=&staff=&date=` is the whole state of the flow. Nothing
 * is held in the browser, which is what makes the back button work: going back
 * a step is going back a URL, and a customer who reloads at the third step is
 * still at the third step with the same service. A wizard holding its answers
 * in memory loses all of them to a phone that decides to reclaim a tab.
 */
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
  const step = resolveStep(query.etape, service !== undefined, hasTeam);

  const zone = provider.timezone;
  // Today where the salon is, not where this process runs. `from` and `to` are
  // dates in the provider's own zone by the contract's own words, and a server
  // in Paris would otherwise start the week a day early for half of every day.
  const today = calendarDay(new Date(), zone);
  const from = query.date && DATE.test(query.date) && query.date >= today ? query.date : today;
  const to = addDays(from, WINDOW_DAYS - 1);

  const [slots, places] = await Promise.all([
    // Only once a service is chosen, and only on the step that shows them: a
    // slot's length comes from that offering's own duration and buffers, so
    // there is no such thing as the slot list of a provider in general.
    step === 3 && service
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
    step === 3 && service?.fulfilment === "AT_CUSTOMER"
      ? loadPlaces(provider.locality?.slug)
      : null,
  ]);

  // The response is a flat list of instants across the whole range. A customer
  // reads a day at a time, so they are bucketed by the provider's own calendar
  // day - the day it is at the salon, which is the only day that matters here.
  const groups = slots ? groupByDay(slots.data, zone) : [];
  const bookable = groups.length > 0;

  const back = backStep(slug, step, query, hasTeam);

  // A step nobody will be shown is a step nobody should be told they passed:
  // with no bookable team, "avec qui" never happens and the progress bar says
  // two, not three with a middle one mysteriously ticked.
  const labels = hasTeam ? STEPS : [STEPS[0], STEPS[2]];
  const current = hasTeam ? step : step === 1 ? 1 : 2;

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
  if (step === 3 && service) {
    const nextWeek = stepHref(slug, {
      etape: 3,
      service: service.service_offering_id,
      staff: person?.staff_id,
      date: addDays(from, WINDOW_DAYS),
    });

    content = (
      <>
        <p className="t-overline">
          Étape {current} sur {labels.length}
        </p>
        <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
          Quel créneau vous convient ?
        </h1>
        <p className="t-body" style={{ marginTop: "var(--s-3)", maxWidth: "58ch" }}>
          Seuls les créneaux réservables sont affichés. Ce qui est déjà pris
          n'est pas publié.
        </p>
        {refusal}

        {/* One form, one submission. The slot travels with the name and the
            telephone because they are one decision: a slot chosen and then not
            confirmed is a slot nobody took. */}
        <form
          action={book}
          className="stack"
          style={{ "--stack-gap": "var(--s-6)" } as CSSProperties}
        >
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
          {/* The week being shown, so a refusal comes back to this same week. */}
          <input type="hidden" name="date" value={from} />

          {/* Above the slots rather than beside the fields, where the mockup
              put it: on a drop-off the sentence changes what the times below
              mean, and a customer who reads the handover as the length of the
              repair comes back to a workshop that has not started. */}
          <ModeNote service={service} />

          <div>
            <div className="row row--between" style={{ marginBottom: "var(--s-4)" }}>
              <span className="t-strong">{windowLabel(from, to)}</span>
              <span className="row" style={{ gap: "var(--s-1)" }}>
                {from > today ? (
                  <Link
                    className="btn btn--ghost btn--sm btn--icon"
                    aria-label="Semaine précédente"
                    href={stepHref(slug, {
                      etape: 3,
                      service: service.service_offering_id,
                      staff: person?.staff_id,
                      date: laterOf(today, addDays(from, -WINDOW_DAYS)),
                    })}
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

            {bookable ? (
              <>
                {/* Days the week actually has room in, and how much. They jump
                    to their own group rather than reloading: every slot of the
                    week is already on this page, and a day is a heading in it
                    rather than another request. */}
                <div className="daystrip">
                  {groups.map((group) => (
                    <a className="day" key={group.date} href={`#creneaux-${group.date}`}>
                      <span className="day__dow">{dayOfWeek(group.date)}</span>
                      <span className="day__num">{dayNumber(group.date)}</span>
                      <span className="day__free">
                        {group.slots.length} libre{group.slots.length > 1 ? "s" : ""}
                      </span>
                    </a>
                  ))}
                </div>
                <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
                  <Icon name="info" size={16} /> Les jours de fermeture et les
                  congés du professionnel n'apparaissent pas.
                </p>

                <div style={{ marginTop: "var(--s-6)" }}>
                  {groups.map((group) => (
                    <div
                      className="slots__group"
                      id={`creneaux-${group.date}`}
                      key={group.date}
                    >
                      <div className="slots__label">
                        <Icon name="calendar" size={16} /> {dayLabel(group.date)}
                      </div>
                      <div
                        className="slots"
                        role="group"
                        aria-label={`Créneaux du ${dayLabel(group.date)}`}
                      >
                        {group.slots.map((slot) => (
                          <label className="slot choice" key={slot.starts_at}>
                            {/* `.slot` draws the tile, `.choice` is what the
                                stylesheet gives a radio: the checked state and
                                the focus ring the mockup's link had for free. */}
                            <input
                              type="radio"
                              name="starts_at"
                              value={slot.starts_at}
                              required
                            />
                            <span>{time(slot.starts_at, zone)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {slots?.next_cursor ? (
                  <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
                    Cette semaine compte plus de créneaux que la page n'en
                    montre. Les jours suivants en ont d'autres.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="empty empty--tight">
                <Scene name="chair" className="scene-ill scene-ill--sm" />
                <div className="empty__title">Rien de libre cette semaine</div>
                <p className="empty__body">
                  {person
                    ? `${person.display_name} n'a plus de place du ${dayLabel(from)} au ${dayLabel(to)}. La semaine suivante est souvent plus ouverte, ou revenez à l'étape précédente pour ne demander personne en particulier.`
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
          </div>

          {bookable ? (
            <>
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Qui réserve</div>
                    <div className="panel__sub">
                      Ces informations servent uniquement au professionnel pour
                      vous accueillir et vous prévenir. Aucun compte n'est créé.
                    </div>
                  </div>
                </div>
                <div className="card__body">
                  <div className="field">
                    <label className="field__label" htmlFor="bk-name">
                      Nom et prénom
                      <span className="field__req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      className="input"
                      id="bk-name"
                      name="full_name"
                      type="text"
                      required
                      maxLength={120}
                      autoComplete="name"
                      placeholder="Ex. Aminata Condé"
                    />
                  </div>

                  {/* No "+224" prefix, which the mockup drew. The API normalises
                      the number from the PROVIDER's own country, and this page
                      has no country to read - printing one dialling code would
                      be right in Conakry and wrong the first time a business is
                      anywhere else. */}
                  <div className="field">
                    <label className="field__label" htmlFor="bk-phone">
                      Téléphone
                      <span className="field__req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      className="input"
                      id="bk-phone"
                      name="phone"
                      type="tel"
                      required
                      maxLength={24}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="6XX XX XX XX"
                      aria-describedby="bk-phone-hint"
                    />
                    <p className="field__hint" id="bk-phone-hint">
                      Le professionnel vous appelle sur ce numéro en cas
                      d'imprévu.
                    </p>
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="bk-note">
                      Un mot pour le professionnel{" "}
                      <span className="field__optional">facultatif</span>
                    </label>
                    <textarea
                      className="textarea"
                      id="bk-note"
                      name="customer_note"
                      rows={3}
                      maxLength={500}
                      placeholder="Ex. j'apporte mes propres mèches."
                    />
                  </div>
                </div>
              </div>

              {/* Only on a call-out: the contract refuses an address on
                  anything else, so a block shown always would turn every salon
                  booking into a 422. */}
              {places ? <AddressFields places={places} /> : null}

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
                      J'accepte que mon nom et mon numéro soient transmis à{" "}
                      {provider.business_name}
                    </strong>
                    <span>
                      Ils sont conservés par ce professionnel, pas par Balaaca.
                    </span>
                  </span>
                </label>
              </div>

              <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
                <Link className="btn btn--ghost" href={back.href}>
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
                  Le prix est figé maintenant. Il ne changera pas, même si le
                  professionnel modifie son tarif ensuite.
                </p>
              ) : null}
            </>
          ) : null}
        </form>
      </>
    );
  } else if (step === 1) {
    content = (
      <ServiceStep
        slug={slug}
        provider={provider}
        chosen={query.service}
        hasTeam={hasTeam}
        labels={labels}
        refusal={refusal}
      />
    );
  } else {
    content = (
      <StaffStep
        slug={slug}
        service={query.service ?? ""}
        staff={staff}
        chosen={query.staff}
        back={back.href}
        labels={labels}
        refusal={refusal}
      />
    );
  }

  return (
    <>
      <header className="hdr">
        <div className="page hdr__in">
          <Link className="logo" href="/">
            <span className="logo__mark" aria-hidden="true">
              B
            </span>
            <span className="logo__word">
              Bala<em>a</em>ca
            </span>
          </Link>
          <div className="hdr__actions">
            <Link className="hdr__link" href={`/p/${encodeURIComponent(slug)}`}>
              Quitter
            </Link>
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
                <Icon name="lock" size={16} />{" "}
                <span>
                  Aucun compte n'est créé. Votre numéro sert uniquement à ce
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

/* --- Steps --------------------------------------------------------------- */

/** Step one: what is being booked, with its duration and its price. */
function ServiceStep({
  slug,
  provider,
  chosen,
  hasTeam,
  labels,
  refusal,
}: {
  slug: string;
  provider: PublicProvider;
  chosen: string | undefined;
  hasTeam: boolean;
  labels: readonly string[];
  refusal: ReactNode;
}) {
  // Nobody is published as bookable, so "with whom" has a single answer and
  // asking it would be a screen the customer taps through. Skip to the slots.
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
            <div className="empty__title">Rien à réserver pour l'instant</div>
            <p className="empty__body">
              Ce professionnel n'a pas encore publié de prestation. Sa page
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
                aria-current={one.service_offering_id === chosen ? "true" : undefined}
              >
                <div className="svc__photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo ? <img src={photo} alt="" loading="lazy" /> : null}
                </div>
                <div className="grow">
                  <h2 className="svc__name">{one.name}</h2>
                  {one.description ? (
                    <p className="svc__desc">{one.description}</p>
                  ) : null}
                  <div className="svc__facts">
                    <ModeBadge fulfilment={one.fulfilment} />
                    <span className="fact">
                      <Icon name="clock" />
                      {duration(one.duration_minutes)}
                    </span>
                    {/* Only a drop-off carries one, which is what makes it a
                        drop-off: the server derives the fulfilment from this
                        very field. */}
                    {one.turnaround_hours ? (
                      <span className="fact">
                        <Icon name="hourglass" />
                        Prêt sous {turnaround(one.turnaround_hours)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="svc__cta">
                  {/* A price the provider chose not to publish is absent from
                      the projection entirely - not zero, not null - so there is
                      nothing to print and no "prix non communiqué" to invent. */}
                  {one.price ? <span className="t-price">{money(one.price)}</span> : null}
                  <span className="btn btn--secondary">
                    <span className="btn__label--idle">Choisir</span>
                    <Icon name="chevron-right" size={16} />
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

/**
 * Step two: with whom.
 *
 * <p>"Peu importe" is the default and it stays the default, because it is the
 * answer that gets a customer seen soonest. Naming somebody is offered, and
 * the sentence under the heading says what it costs - which is the difference
 * a select at the bottom of a form never manages to say.
 *
 * <p>Links rather than the mockup's radios: the answer is a step in the URL,
 * so choosing IS navigating and there is nothing left for a "Continuer" button
 * to do.
 */
function StaffStep({
  slug,
  service,
  staff,
  chosen,
  back,
  labels,
  refusal,
}: {
  slug: string;
  service: string;
  staff: PublicStaffList;
  chosen: string | undefined;
  back: string;
  labels: readonly string[];
  refusal: ReactNode;
}) {
  const named = staff.data.some((one) => one.staff_id === chosen);

  return (
    <>
      <p className="t-overline">Étape 2 sur {labels.length}</p>
      <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
        Avec qui ?
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)", maxWidth: "58ch" }}>
        Demander une personne en particulier est une promesse différente : si
        son créneau part, il ne sera pas remplacé par celui d'un collègue.
      </p>
      {refusal}

      <div className="choice-grid" style={{ marginTop: "var(--s-6)" }}>
        <Link
          className="choice"
          href={stepHref(slug, { etape: 3, service })}
          aria-current={named ? undefined : "true"}
        >
          <span className="choice__head">
            <span className="choice__icon">
              <Icon name="users" />
            </span>
            <span>
              <span className="choice__title">Peu importe</span>
              <span className="choice__desc" style={{ marginTop: 0 }}>
                Vous voyez tous les créneaux libres de l'équipe, et le
                professionnel vous confie à qui est disponible.
              </span>
            </span>
          </span>
        </Link>

        {staff.data.map((one) => (
          <Link
            key={one.staff_id}
            className="choice"
            href={stepHref(slug, { etape: 3, service, staff: one.staff_id })}
            aria-current={one.staff_id === chosen ? "true" : undefined}
          >
            <span className="choice__head">
              <Avatar name={one.display_name} />
              <span>
                <span className="choice__title">{one.display_name}</span>
                <span className="choice__desc" style={{ marginTop: 0 }}>
                  Seuls ses créneaux à elle ou à lui vous seront proposés.
                </span>
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="row" style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}>
        <Link className="btn btn--ghost" href={back}>
          <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
            <Icon name="arrow-left" size={18} />
          </span>
          <span className="btn__label--idle">Retour</span>
        </Link>
      </div>
    </>
  );
}

/**
 * Where the provider is going.
 *
 * <p>Part of the third step rather than a fourth one. The address is not a
 * decision the customer makes - it is where they already are - and a screen
 * that asks for it on its own would put a wall between choosing a time and
 * confirming, for a question that is three fields long.
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
          <div className="panel__title">Où doit-on venir ?</div>
          <div className="panel__sub">
            Aucune coordonnée GPS n'est demandée ni enregistrée. Ces indications
            ne servent qu'à ce rendez-vous.
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
              <option value="">Je préfère ne pas préciser</option>
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
              id="bk-area"
              name="area"
              type="text"
              list="bk-quartiers"
              maxLength={80}
              autoComplete="off"
              placeholder="Ex. Nongo"
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
            Comment vous trouver
            <span className="field__req" aria-hidden="true">
              *
            </span>
          </label>
          <textarea
            className="textarea"
            id="bk-directions"
            name="directions"
            rows={3}
            required
            maxLength={500}
            placeholder="Derrière la mosquée de Nongo, portail bleu"
            aria-describedby="bk-directions-hint"
          />
          <p className="field__hint" id="bk-directions-hint">
            Le repère qui amène le professionnel à votre porte : un commerce, un
            carrefour, la couleur du portail.
          </p>
        </div>
      </div>
    </div>
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

/**
 * What has been answered so far, and what the booking will cost.
 *
 * <p>No date and no hour, which the mockup's own recap carried: the slot is
 * chosen inside the form and posted with the rest, so until the submission
 * there is nothing the server knows about either - and a row that says "à
 * choisir" on every screen of the flow is a row that says nothing.
 */
function Recap({
  provider,
  service,
  person,
  step,
  hasTeam,
}: {
  provider: PublicProvider;
  service: PublicServiceOffering | undefined;
  person: PublicStaffMember | undefined;
  step: number;
  hasTeam: boolean;
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
              value={person ? person.display_name : step === 3 ? "Peu importe" : "à choisir"}
              pending={!person}
            />
          ) : null}
          {service ? (
            <>
              <RecapRow
                label={durationLabel(service.fulfilment)}
                value={duration(service.duration_minutes)}
              />
              {service.turnaround_hours ? (
                <RecapRow
                  label="Prêt sous"
                  value={turnaround(service.turnaround_hours)}
                />
              ) : null}
              <RecapRow
                label="Déroulement"
                value={<ModeBadge fulfilment={service.fulfilment} />}
              />
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
  body: "Vous vous rendez chez le professionnel et la prestation est réalisée pendant que vous attendez.",
};

const MODE: Record<string, ModeCopy> = {
  ON_SITE,
  AT_CUSTOMER: {
    slug: "at-customer",
    icon: "mode-atcustomer",
    label: "À domicile",
    title: "À domicile · Le professionnel se déplace",
    body: "Le professionnel se déplace jusqu'à l'adresse que vous indiquez.",
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

function ModeBadge({ fulfilment }: { fulfilment: Fulfilment }) {
  const mode = modeOf(fulfilment);
  return (
    <span className={`mode mode--${mode.slug}`}>
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
              Vous déposez l'article, vous repassez le récupérer une fois le
              travail terminé.{" "}
              {service.turnaround_hours ? (
                <strong>Prêt sous {turnaround(service.turnaround_hours)}.</strong>
              ) : (
                "Le professionnel vous dira quand revenir le chercher."
              )}{" "}
              Le créneau ci-dessous n'est que la remise au comptoir (
              {duration(service.duration_minutes)}), ce n'est pas la durée du
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
};

/** One position in the flow, written as the URL that restores it. */
function stepHref(slug: string, at: Position): string {
  const query = new URLSearchParams({ etape: String(at.etape) });
  if (at.service) query.set("service", at.service);
  if (at.staff) query.set("staff", at.staff);
  if (at.date) query.set("date", at.date);
  return `/p/${encodeURIComponent(slug)}/reserver?${query.toString()}`;
}

/**
 * Which step the URL actually names.
 *
 * <p>A step is only reachable once the steps before it have an answer, so a
 * hand-typed `?etape=3` with no service is step one rather than a crash. The
 * URL is the state, which means the URL is also untrusted input.
 */
function resolveStep(
  asked: string | undefined,
  hasService: boolean,
  hasTeam: boolean,
): 1 | 2 | 3 {
  const wanted = Number(asked);
  if (!hasService || !Number.isInteger(wanted) || wanted <= 1) return 1;
  if (wanted >= 3) return 3;
  return hasTeam ? 2 : 3;
}

/** Where the arrow at the top goes: one step back, or out of the flow. */
function backStep(
  slug: string,
  step: number,
  query: Search,
  hasTeam: boolean,
): { href: string; label: string } {
  if (step === 1) {
    return {
      href: `/p/${encodeURIComponent(slug)}`,
      label: "Retour à la page du professionnel",
    };
  }
  if (step === 2) {
    return {
      href: stepHref(slug, { etape: 1, service: query.service }),
      label: "Étape précédente",
    };
  }
  return {
    href: stepHref(slug, {
      etape: hasTeam ? 2 : 1,
      service: query.service,
      staff: query.staff,
    }),
    label: "Étape précédente",
  };
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

/** Minutes as a provider writes them: "45 min", "1 h", "1 h 30". */
function duration(minutes: number): string {
  // A narrow no-break space, so a duration never wraps between its digits and
  // its unit at the end of a line.
  const gap = " ";
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
 * is not. Anything that is not a round day stays in hours, because rounding a
 * promise the provider made is not this page's decision.
 */
function turnaround(hours: number): string {
  const gap = " ";
  return hours >= 24 && hours % 24 === 0
    ? `${hours / 24}${gap}jour${hours === 24 ? "" : "s"}`
    : `${hours}${gap}h`;
}

/** What the offering's duration is a duration OF - the fulfilment decides. */
function durationLabel(fulfilment: Fulfilment): string {
  if (fulfilment === "DROP_OFF") return "Dépôt";
  if (fulfilment === "AT_CUSTOMER") return "Durée de la visite";
  return "Durée";
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
