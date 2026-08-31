import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { ActionButton, Avatar, Button, EmptyState, Notice } from "@/components/ui";
import { ApiError, publicApi } from "@/lib/api";
import { money, time } from "@/lib/format";
import type {
  AvailableSlotPage,
  PublicProvider,
  PublicStaffList,
} from "@/lib/types";
import { book } from "./actions";
import "./booking.css";

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
 */
const STEPS = [
  "Choisir une prestation",
  "Choisir avec qui",
  "Choisir un créneau",
];

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
  const step = resolveStep(query.etape, service !== undefined, staff.data.length > 0);

  const zone = provider.timezone;
  // Today where the salon is, not where this process runs. `from` and `to` are
  // dates in the provider's own zone by the contract's own words, and a server
  // in Paris would otherwise start the week a day early for half of every day.
  const today = calendarDay(new Date(), zone);
  const from = query.date && DATE.test(query.date) && query.date >= today ? query.date : today;
  const to = addDays(from, WINDOW_DAYS - 1);

  // Only once a service is chosen, and only on the step that shows them: a
  // slot's length comes from that offering's own duration and buffers, so
  // there is no such thing as the slot list of a provider in general.
  const slots =
    step === 3 && service
      ? await publicApi<AvailableSlotPage>(
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
      : null;

  // The response is a flat list of instants across the whole range. A customer
  // reads a day at a time, so they are bucketed by the provider's own calendar
  // day - the day it is at the salon, which is the only day that matters here.
  const groups = slots ? groupByDay(slots.data, zone) : [];

  const back = backStep(slug, step, query, staff.data.length > 0);
  const refusal = query.error ? (
    <Notice tone="danger" title="La réservation n'a pas abouti">
      {REFUSALS[query.error] ??
        "Le professionnel n'a pas pu enregistrer ce rendez-vous. Réessayez, ou appelez-le directement."}
    </Notice>
  ) : null;

  const head = (
    <header className="topbar">
      <Link className="icon-btn" href={back.href} aria-label={back.label}>
        <Icon name="arrow-left" />
      </Link>
      <div className="grow stack" style={{ gap: 0 }}>
        <span className="t-small">Réserver</span>
        <span className="t-caption t-dim">{provider.business_name}</span>
      </div>
    </header>
  );

  if (step !== 3 || !service) {
    return (
      <div className="book">
        {head}
        <main className="container container--booking book__body stack stack-8" id="contenu">
          <Stepper step={step} />
          {refusal}
          {step === 1 ? (
            <ServiceStep slug={slug} provider={provider} chosen={query.service} team={staff} />
          ) : (
            <StaffStep slug={slug} service={query.service ?? ""} staff={staff} chosen={query.staff} />
          )}
        </main>
      </div>
    );
  }

  const bookable = groups.length > 0;

  return (
    <div className="book">
      {head}
      {/* One form, one submission. The slot travels with the name and the
          telephone because they are one decision: a slot chosen and then not
          confirmed is a slot nobody took. */}
      <form action={book} className="book__form">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="service_offering_id" value={service.service_offering_id} />
        {/* Rendered only when someone was asked for. An empty field would post
            an empty staff_id, and the contract's answer to "nobody in
            particular" is an absent field, never a null. */}
        {person ? <input type="hidden" name="staff_id" value={person.staff_id} /> : null}
        {/* The week being shown, so a refusal comes back to this same week. */}
        <input type="hidden" name="date" value={from} />

        <main className="container container--booking book__body stack stack-8" id="contenu">
          <Stepper step={3} />
          {refusal}

          <section className="stack stack-6">
            <div className="stack stack-2">
              <h1 className="t-h3">Quand vous convient-il ?</h1>
              <p className="t-small t-muted" style={{ fontWeight: 400 }}>
                {service.name} · {duration(service.duration_minutes)} — les créneaux
                tiennent compte de cette durée
                {person ? `, avec ${person.display_name}` : ""}.
              </p>
            </div>

            <div className="recap">
              <RecapRow label="Prestation" value={service.name} />
              <RecapRow label="Durée" value={duration(service.duration_minutes)} />
              <RecapRow label="Avec" value={person ? person.display_name : "Peu importe"} />
              {service.price ? (
                <RecapRow label="À régler sur place" value={money(service.price)} total />
              ) : null}
            </div>

            <fieldset className="book__group stack stack-5">
              <legend className="t-label">Créneau</legend>

              <div className="row row--between row-3 row--wrap">
                <span className="t-caption t-dim">
                  Du {dayLabel(from)} au {dayLabel(to)}
                </span>
                <div className="row row-2">
                  {from > today ? (
                    <Button
                      label="Semaine précédente"
                      variant="ghost"
                      size="sm"
                      icon="chevron-left"
                      href={stepHref(slug, {
                        etape: 3,
                        service: service.service_offering_id,
                        staff: person?.staff_id,
                        date: laterOf(today, addDays(from, -WINDOW_DAYS)),
                      })}
                    />
                  ) : null}
                  <Button
                    label="Semaine suivante"
                    variant="ghost"
                    size="sm"
                    iconEnd="chevron-right"
                    href={stepHref(slug, {
                      etape: 3,
                      service: service.service_offering_id,
                      staff: person?.staff_id,
                      date: addDays(from, WINDOW_DAYS),
                    })}
                  />
                </div>
              </div>

              {bookable ? (
                groups.map((group) => (
                  <div className="slot-group" key={group.date}>
                    <div className="slot-group__head">
                      <span className="t-caption t-dim">{dayLabel(group.date)}</span>
                    </div>
                    <div
                      className="slot-grid"
                      role="group"
                      aria-label={`Créneaux du ${dayLabel(group.date)}`}
                    >
                      {group.slots.map((slot) => (
                        <label className="slot slot--pick" key={slot.starts_at}>
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
                ))
              ) : (
                <EmptyState
                  compact
                  sketch="chair"
                  title="Rien de libre cette semaine"
                  body={
                    person
                      ? `${person.display_name} n'a plus de place du ${dayLabel(from)} au ${dayLabel(to)}. La semaine suivante est souvent plus ouverte, ou revenez à l'étape précédente pour ne demander personne en particulier.`
                      : `Tout est pris du ${dayLabel(from)} au ${dayLabel(to)}. Essayez la semaine suivante.`
                  }
                  action={
                    <Button
                      label="Voir la semaine suivante"
                      variant="secondary"
                      iconEnd="chevron-right"
                      href={stepHref(slug, {
                        etape: 3,
                        service: service.service_offering_id,
                        staff: person?.staff_id,
                        date: addDays(from, WINDOW_DAYS),
                      })}
                    />
                  }
                />
              )}

              {slots?.next_cursor ? (
                <p className="t-caption t-dim">
                  Cette semaine compte plus de créneaux que la page n'en montre.
                  Les jours suivants en ont d'autres.
                </p>
              ) : null}
            </fieldset>
          </section>

          {bookable ? (
            <section className="stack stack-5">
              <div className="stack stack-2">
                <h2 className="t-h4">Vos informations</h2>
                <p className="t-small t-muted" style={{ fontWeight: 400 }}>
                  Elles servent uniquement au professionnel pour vous accueillir et
                  vous prévenir. Aucun compte n'est créé.
                </p>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="bk-name">
                  Nom complet
                  <span className="field__req" aria-hidden="true">*</span>
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

              {/* No "+224" prefix, which the mockup drew. The API normalises the
                  number from the PROVIDER's own country, and this page has no
                  country to read - printing one dialling code would be right in
                  Conakry and wrong the first time a business is anywhere else. */}
              <div className="field">
                <label className="field__label" htmlFor="bk-phone">
                  Téléphone
                  <span className="field__req" aria-hidden="true">*</span>
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
                  Le professionnel vous appelle sur ce numéro en cas d'imprévu.
                </p>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="bk-note">
                  Précision pour le professionnel{" "}
                  <span className="t-caption t-dim" style={{ fontWeight: 500 }}>
                    facultatif
                  </span>
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
            </section>
          ) : null}
        </main>

        {bookable ? (
          <div className="actionbar">
            <div className="grow stack" style={{ gap: 0, minWidth: 0 }}>
              <span className="t-caption t-dim">
                {service.price ? "À régler sur place" : "Prestation"}
              </span>
              <span className="t-small nowrap">
                {service.price ? money(service.price) : service.name}
              </span>
            </div>
            <ActionButton
              label="Confirmer la réservation"
              variant="primary"
              size="lg"
              iconEnd="check"
              type="submit"
            />
          </div>
        ) : null}
      </form>
    </div>
  );
}

/* --- Steps --------------------------------------------------------------- */

/** Step one: what is being booked, with its duration and its price. */
function ServiceStep({
  slug,
  provider,
  chosen,
  team,
}: {
  slug: string;
  provider: PublicProvider;
  chosen: string | undefined;
  team: PublicStaffList;
}) {
  // Nobody is published as bookable, so "with whom" has a single answer and
  // asking it would be a screen the customer taps through. Skip to the slots.
  const next = team.data.length > 0 ? 2 : 3;

  return (
    <section className="stack stack-5">
      <div className="stack stack-2">
        <h1 className="t-h3">Quelle prestation souhaitez-vous ?</h1>
        <p className="t-small t-muted" style={{ fontWeight: 400 }}>
          Les prix et les durées sont ceux affichés par le professionnel.
        </p>
      </div>

      {provider.services.length === 0 ? (
        <EmptyState
          sketch="notebook"
          title="Rien à réserver pour l'instant"
          body="Ce professionnel n'a pas encore publié de prestation. Sa page indique comment le joindre."
          action={
            <Button
              label="Retour à la page"
              variant="secondary"
              href={`/p/${encodeURIComponent(slug)}`}
            />
          }
        />
      ) : (
        <div className="stack stack-3">
          {provider.services.map((one) => (
            <Link
              key={one.service_offering_id}
              className="choice choice--step"
              href={stepHref(slug, { etape: next, service: one.service_offering_id })}
              aria-current={one.service_offering_id === chosen ? "true" : undefined}
            >
              <span className="choice__mark" aria-hidden="true">
                <span className="choice__dot" />
              </span>
              <span className="grow stack stack-1">
                <span className="svc-row__name">{one.name}</span>
                {one.description ? (
                  <span className="svc-row__desc">{one.description}</span>
                ) : null}
                <span className="svc-row__facts" style={{ marginTop: "var(--space-1)" }}>
                  {/* A price the provider chose not to publish is absent from the
                      projection entirely - not zero, not null - so there is
                      nothing to print and no "prix non communiqué" to invent. */}
                  {one.price ? (
                    <>
                      <span className="svc-row__price">{money(one.price)}</span>
                      <span className="svc-row__dot" aria-hidden="true" />
                    </>
                  ) : null}
                  <span className="svc-row__dur">
                    <Icon name="clock" size={13} />
                    {duration(one.duration_minutes)}
                  </span>
                </span>
              </span>
              <span className="nowrap" style={{ color: "var(--text-tertiary)" }}>
                <Icon name="chevron-right" size={18} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Step two: with whom.
 *
 * <p>"Peu importe" is the default and it stays the default, because it is the
 * answer that gets a customer seen soonest. Naming somebody is offered, and
 * the sentence under the heading says what it costs - which is the difference
 * a select at the bottom of a form never manages to say.
 */
function StaffStep({
  slug,
  service,
  staff,
  chosen,
}: {
  slug: string;
  service: string;
  staff: PublicStaffList;
  chosen: string | undefined;
}) {
  const named = staff.data.some((one) => one.staff_id === chosen);

  return (
    <section className="stack stack-5">
      <div className="stack stack-2">
        <h1 className="t-h3">Avec qui ?</h1>
        <p className="t-small t-muted" style={{ fontWeight: 400 }}>
          Demander une personne en particulier est une promesse différente : si
          son créneau part, il ne sera pas remplacé par celui d'un collègue.
        </p>
      </div>

      <div className="stack stack-3">
        <Link
          className="choice choice--step"
          href={stepHref(slug, { etape: 3, service })}
          aria-current={named ? undefined : "true"}
        >
          <span className="choice__mark" aria-hidden="true">
            <span className="choice__dot" />
          </span>
          <span className="grow stack stack-1">
            <span className="svc-row__name">Peu importe</span>
            <span className="svc-row__desc">
              Vous voyez tous les créneaux libres de l'équipe, et le
              professionnel vous confie à qui est disponible.
            </span>
          </span>
        </Link>

        {staff.data.map((one) => (
          <Link
            key={one.staff_id}
            className="choice choice--step"
            href={stepHref(slug, { etape: 3, service, staff: one.staff_id })}
            aria-current={one.staff_id === chosen ? "true" : undefined}
          >
            <span className="choice__mark" aria-hidden="true">
              <span className="choice__dot" />
            </span>
            <span className="grow stack stack-1">
              <span className="svc-row__name">{one.display_name}</span>
              <span className="svc-row__desc">
                Seuls ses créneaux à elle ou à lui vous seront proposés.
              </span>
            </span>
            <span className="nowrap">
              <Avatar name={one.display_name} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* --- Small pieces -------------------------------------------------------- */

function Stepper({ step }: { step: number }) {
  return (
    <div className="stepper">
      <div className="stepper__meta">
        <span className="t-small">{STEPS[step - 1]}</span>
        <span className="t-caption t-dim tnum">
          Étape {step} sur {STEPS.length}
        </span>
      </div>
      <div
        className="stepper__track"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-label="Progression de la réservation"
      >
        <div
          className="stepper__fill"
          style={{ width: `${Math.round((step / STEPS.length) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function RecapRow({
  label,
  value,
  total,
}: {
  label: string;
  value: string;
  total?: boolean;
}) {
  return (
    <div className={total ? "recap__row recap__row--total" : "recap__row"}>
      <span className="recap__key">{label}</span>
      <span className="recap__val">{value}</span>
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
