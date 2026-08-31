import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import {
  ActionButton,
  Button,
  EmptyState,
  Notice,
  StatusBadge,
} from "@/components/ui";
import { ApiError, publicApi } from "@/lib/api";
import { dateTime, day, money, time } from "@/lib/format";
import type {
  AvailableSlotPage,
  CustomerBooking,
  PublicProvider,
  PublicStaffList,
  ReportReason,
} from "@/lib/types";
import { cancelBooking, reportProvider, rescheduleBooking } from "./actions";

/** A live appointment. Cached, this page would show a rendezvous already called off. */
export const dynamic = "force-dynamic";

/**
 * The reference is a capability, and a URL that carries one must not be
 * published by a crawler that happens to find it in a shared message.
 */
export const metadata: Metadata = {
  title: "Ma réservation",
  robots: { index: false, follow: false },
};

/** Why an attempt to call it off was refused, in words a customer can act on. */
const REFUSALS: Record<string, string> = {
  CANCELLATION_DEADLINE_PASSED:
    "Le délai d’annulation en ligne vient de passer. Appelez le professionnel : son numéro est sur sa page.",
  INVALID_STATE_TRANSITION:
    "Ce rendez-vous ne peut plus être annulé : il est déjà annulé, ou il est déjà passé.",
  RESOURCE_NOT_FOUND: "Cette référence ne correspond à aucun rendez-vous.",
  RATE_LIMITED: "Trop de demandes d’un coup. Réessayez dans un instant.",
};

/**
 * Why the move was refused.
 *
 * <p>Separate from the cancellation's, because the two operations share a
 * deadline and share codes while meaning different things to the reader: the
 * same `CANCELLATION_DEADLINE_PASSED` is "trop tard pour annuler" in one place
 * and "trop tard pour déplacer" in the other, and one sentence for both would
 * be wrong in whichever half it was not written for.
 */
const MOVE_REFUSALS: Record<string, string> = {
  SLOT_UNAVAILABLE:
    "Ce créneau vient d’être pris par quelqu’un d’autre. Les horaires ci-dessous sont à jour : choisissez-en un autre.",
  SLOT_OUTSIDE_AVAILABILITY:
    "Ce créneau n’est plus proposé par le professionnel. Choisissez-en un dans la liste ci-dessous, qui vient d’être rechargée.",
  CANCELLATION_DEADLINE_PASSED:
    "Le délai pour changer d’heure en ligne vient de passer. Appelez le professionnel : son numéro est sur sa page.",
  INVALID_STATE_TRANSITION:
    "Ce rendez-vous ne peut plus être déplacé : il est déjà annulé, ou il est déjà passé.",
  RESOURCE_NOT_FOUND: "Cette référence ne correspond à aucun rendez-vous.",
  RATE_LIMITED: "Trop de demandes d’un coup. Réessayez dans un instant.",
};

/** Why the report did not leave. */
const REPORT_REFUSALS: Record<string, string> = {
  VALIDATION_FAILED:
    "Choisissez un motif, et tenez le détail en mille caractères au plus.",
  RESOURCE_NOT_FOUND: "Cette référence ne correspond à aucun rendez-vous.",
  RATE_LIMITED: "Trop de demandes d’un coup. Réessayez dans un instant.",
};

/**
 * The five things a customer can report, in their words rather than the wire's.
 *
 * <p>Typed by the contract's own enum, so a reason added or removed there stops
 * this page compiling instead of quietly offering a value the API refuses.
 */
const REASONS: { value: ReportReason; label: string }[] = [
  { value: "NO_SHOW", label: "Le salon était fermé" },
  { value: "NOT_AS_DESCRIBED", label: "La prestation n’était pas celle annoncée" },
  { value: "OVERCHARGED", label: "Le prix n’était pas celui annoncé" },
  { value: "RUDE_OR_UNSAFE", label: "Comportement inacceptable" },
  { value: "OTHER", label: "Autre" },
];

/**
 * How many days of slots the move offers at once.
 *
 * <p>A week, the same window the booking flow reads, and for the same reason:
 * somebody who cannot come tomorrow wants to see Saturday without a round trip.
 */
const WINDOW_DAYS = 7;

/** A date as the contract writes one, and as this page puts one in a URL. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Slot = AvailableSlotPage["data"][number];

/** One week of slots for this exact appointment, ready to be drawn. */
type MoveWindow = {
  today: string;
  from: string;
  to: string;
  groups: { date: string; slots: Slot[] }[];
  more: boolean;
};

type Search = {
  error?: string;
  cancelled?: string;
  move?: string;
  moved?: string;
  move_error?: string;
  date?: string;
  report?: string;
  reported?: string;
  report_error?: string;
};

/**
 * A customer's own appointment, reachable by its reference alone.
 *
 * <p>No account, no sign-in: the reference is the handle, it is what the
 * confirmation message carries, and it is what this URL is. Anything else would
 * mean asking somebody to create an account to look at a haircut they have
 * already booked.
 *
 * <p>The mockup built its confirmation screen on the belief that this page
 * could not exist - "cette page ne pourra pas être rouverte plus tard" - and
 * told the customer to take a screenshot. `getBooking` is in the contract, so
 * the screenshot is not the product: this is.
 *
 * <p>The same reference authorises three things and no more: reading this,
 * moving it, calling it off. The report at the bottom is the fourth, and it is
 * the one that goes somewhere other than the salon.
 */
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Search>;
}) {
  const { reference } = await params;
  const query = await searchParams;

  let booking: CustomerBooking;
  try {
    booking = await publicApi<CustomerBooking>(
      `/v1/bookings/${encodeURIComponent(reference)}`,
    );
  } catch (error) {
    // A reference that names nothing and one at a suspended business answer
    // identically, and so does this page. A reference the contract's pattern
    // rejects outright is a 400 and belongs here too: it also names nothing,
    // and a 500 would tell a mistyped character that the product is broken.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  // The provider's own zone, sent with the booking. A customer reading "14:00"
  // wants the time at the salon, not the time where their phone happens to be,
  // and the browser's zone is the one thing here that is nobody's business.
  const zone = booking.timezone;
  // The API already decided this, and re-deciding it here would be the drift
  // that puts a button in front of a customer the server is about to refuse:
  // cancellable_until is ABSENT - not a date in the past - once the window has
  // closed or the appointment is no longer open. Its presence is the answer,
  // and reading a clock during a render would be a second, worse one.
  //
  // The move is bound by the same deadline, by the contract's own words, so it
  // is gated on the same field rather than on a second guess about time.
  const deadline = booking.cancellable_until;
  // Still ahead of the customer, as opposed to over, called off, or missed.
  const open = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const providerPage = `/p/${encodeURIComponent(booking.provider_slug)}`;

  // Three more calls, so they are made only when the customer has asked to see
  // slots. Most people open this page to re-read a reference and leave.
  const move =
    open && deadline && query.move === "1" ? await loadMove(booking, query.date) : null;

  return (
    <div className="book">
      <header className="topbar">
        <Link
          className="icon-btn"
          href={providerPage}
          aria-label={`Retour à la page de ${booking.provider_name}`}
        >
          <Icon name="arrow-left" size={18} />
        </Link>
        <div className="grow stack" style={{ gap: 0 }}>
          <span className="t-small">Ma réservation</span>
          <span className="t-caption t-dim">{booking.provider_name}</span>
        </div>
      </header>

      <main className="container container--booking book__body stack stack-8" id="contenu">
        <div className="stack stack-2">
          <h1 className="t-h2">Votre rendez-vous</h1>
          <p className="t-body-lg t-muted" style={{ fontWeight: 400 }}>
            {lead(booking, zone)}
          </p>
        </div>

        {query.cancelled ? (
          <Notice tone="success" title="C’est annulé.">
            Le créneau a été rendu. Vous pouvez reprendre rendez-vous quand vous
            voulez, sur la page du professionnel.
          </Notice>
        ) : null}

        {query.moved ? (
          <Notice tone="success" title="C’est déplacé.">
            Le billet ci-dessous porte la nouvelle heure, et le professionnel a
            été prévenu. L’ancien créneau a été rendu.
          </Notice>
        ) : null}

        {query.reported ? (
          <Notice tone="success" title="Le signalement est parti.">
            Balaaca l’a reçu. Le professionnel n’en est pas informé et ne peut
            pas le lire. Il n’y a rien d’autre à faire de votre côté, et rien à
            venir consulter ici.
          </Notice>
        ) : null}

        {query.error ? (
          <Notice tone="danger" title="L’annulation n’a pas abouti">
            {REFUSALS[query.error] ??
              "Réessayez dans un instant, ou appelez le professionnel : son numéro est sur sa page."}
          </Notice>
        ) : null}

        {query.move_error ? (
          <Notice tone="danger" title="Le déplacement n’a pas abouti">
            {MOVE_REFUSALS[query.move_error] ??
              "Réessayez dans un instant, ou appelez le professionnel : son numéro est sur sa page."}
          </Notice>
        ) : null}

        {query.report_error ? (
          <Notice tone="danger" title="Le signalement n’est pas parti">
            {REPORT_REFUSALS[query.report_error] ??
              "Réessayez dans un instant."}
          </Notice>
        ) : null}

        {/* Le billet. Ce qui est écrit dessus est ce qu'il faut savoir en
            arrivant : chez qui, quoi, avec qui, quand, combien. */}
        <div className="ticket">
          <div className="ticket__head on-dark stack stack-3">
            <div className="row row--between row-4 row--wrap">
              <div className="stack" style={{ gap: 2 }}>
                <span className="t-label">Référence</span>
                <span className="t-h4 tnum nowrap" style={{ color: "var(--ink-fg)" }}>
                  {booking.reference}
                </span>
              </div>
              <StatusBadge status={booking.status} />
            </div>
            <p className="t-small t-muted" style={{ fontWeight: 400 }}>
              {STATUS_NOTE[booking.status] ?? ""}
            </p>
          </div>

          <div className="ticket__perf" aria-hidden="true" />

          <div className="ticket__body stack stack-4">
            <TicketRow icon="store" label="Chez" value={booking.provider_name} />
            <TicketRow icon="scissors" label="Prestation" value={booking.service_name} />
            <TicketRow icon="user" label="Avec" value={booking.staff_name} />
            <TicketRow icon="calendar" label="Date" value={day(booking.starts_at, zone)} />
            <TicketRow
              icon="clock"
              label="Heure"
              value={`${time(booking.starts_at, zone)} – ${time(booking.ends_at, zone)}`}
              // Le rendez-vous est à l'heure du salon. Une tante à Paris qui
              // réserve pour sa nièce à Conakry lit sinon une heure qui n'est
              // celle de personne.
              hint={`Heure de ${placeOf(zone)}`}
            />
            <TicketRow
              icon="wallet"
              label="À régler sur place"
              value={money(booking.price)}
            />
          </div>
        </div>

        {/* La référence est la seule clé. Dans un champ, parce qu'un appui long
            sur un champ propose « Tout sélectionner / Copier » sur un
            téléphone, ce qu'un simple paragraphe ne fait pas. */}
        <div className="card card--pad stack stack-3">
          <div className="field">
            <label className="field__label" htmlFor="reference">
              Gardez cette référence
            </label>
            <input
              className="input tnum"
              id="reference"
              type="text"
              value={booking.reference}
              readOnly
              aria-describedby="reference-hint"
            />
            <p className="field__hint" id="reference-hint">
              Appuyez longuement dessus pour la copier. C’est le seul moyen de
              rouvrir cette page : il n’y a pas de compte, et personne d’autre
              ne peut vous la redonner. Le lien de cette page la contient déjà,
              alors gardez-le aussi.
            </p>
          </div>
        </div>

        {/* Offered before the cancellation, on purpose: keeping the customer is
            the better outcome for both sides, and somebody who only needs
            another hour should meet that option first. */}
        {open && deadline ? (
          <section className="stack stack-4" id="move" aria-labelledby="move-head">
            <div className="stack stack-2">
              <div className="row row-3">
                <span className="rule-accent" aria-hidden="true" />
                <h2 className="t-label" id="move-head">
                  Déplacer
                </h2>
              </div>
              <p className="t-small t-muted" style={{ fontWeight: 400 }}>
                La même prestation avec la même personne, à une autre heure.
                Comme l’annulation, c’est possible en ligne jusqu’au{" "}
                <strong>{dateTime(deadline, zone)}</strong>.
              </p>
            </div>

            {move ? (
              <MoveForm booking={booking} week={move} zone={zone} />
            ) : query.move === "1" ? (
              <Notice tone="warning" title="Le déplacement en ligne n’est pas possible">
                Cette prestation n’est plus proposée en ligne, alors la
                plateforme ne sait plus quels créneaux vous proposer. Appelez le
                professionnel : son numéro est sur sa page, et il déplacera le
                rendez-vous lui-même.
              </Notice>
            ) : (
              <Button
                label="Déplacer mon rendez-vous"
                variant="secondary"
                icon="calendar"
                href={moveHref(booking.reference)}
              />
            )}
          </section>
        ) : null}

        {open && deadline ? (
          <section className="stack stack-4" aria-labelledby="cancel-head">
            <div className="stack stack-2">
              {/* La barre est un élément à elle seule - 28 px sur 2 - et non un
                  modificateur de texte : posée sur le titre, elle le réduirait
                  à un trait. */}
              <div className="row row-3">
                <span className="rule-accent" aria-hidden="true" />
                <h2 className="t-label" id="cancel-head">
                  Annuler
                </h2>
              </div>
              <p className="t-small t-muted" style={{ fontWeight: 400 }}>
                Vous pouvez encore annuler en ligne jusqu’au{" "}
                <strong>{dateTime(deadline, zone)}</strong>. Le créneau sera
                rendu tout de suite et le professionnel en sera averti.
              </p>
            </div>

            <form className="stack stack-4" action={cancelBooking}>
              <input type="hidden" name="reference" value={booking.reference} />
              <div className="field">
                <label className="field__label" htmlFor="reason">
                  Un mot pour le professionnel{" "}
                  <span className="t-caption t-dim" style={{ fontWeight: 500 }}>
                    facultatif
                  </span>
                </label>
                <textarea
                  className="textarea"
                  id="reason"
                  name="reason"
                  rows={2}
                  maxLength={200}
                  placeholder="Ex. un imprévu, je reprendrai rendez-vous."
                  aria-describedby="reason-hint"
                />
                <p className="field__hint" id="reason-hint">
                  Il le lira dans son agenda. Deux cents caractères au plus.
                </p>
              </div>
              <ActionButton
                label="Annuler ce rendez-vous"
                variant="danger"
                type="submit"
                icon="ban"
              />
            </form>
          </section>
        ) : null}

        {open && !deadline ? (
          <Notice tone="warning" title="Les changements en ligne sont fermés">
            Le délai fixé par le professionnel est passé : ce rendez-vous ne peut
            plus être déplacé ni annulé depuis cette page. Si vous avez un
            empêchement, appelez-le : son numéro est sur sa page, et prévenir
            vaut mieux que ne pas venir.
          </Notice>
        ) : null}

        <div className="stack stack-3">
          <Button
            label={`Revenir chez ${booking.provider_name}`}
            variant={open ? "secondary" : "primary"}
            block
            iconEnd="arrow-right"
            href={providerPage}
          />
          <Button label="Rechercher un autre professionnel" variant="ghost" block href="/" />
        </div>

        <ReportSection booking={booking} query={query} />
      </main>
    </div>
  );
}

/* --- Moving -------------------------------------------------------------- */

/**
 * The week of slots, and a button per slot.
 *
 * <p>One press moves the appointment, with no confirmation screen in between.
 * That is deliberate and it is why the sentence above the grid says so: the
 * move is reversible for as long as the deadline holds, and a second screen
 * asking "are you sure" between two taps is the friction that sends people to
 * the telephone instead.
 */
function MoveForm({
  booking,
  week: at,
  zone,
}: {
  booking: CustomerBooking;
  week: MoveWindow;
  zone: string;
}) {
  return (
    <form className="stack stack-5" action={rescheduleBooking}>
      <input type="hidden" name="reference" value={booking.reference} />
      {/* The week being read, so a refusal comes back to this same week. */}
      <input type="hidden" name="date" value={at.from} />

      <p className="t-small t-muted" style={{ fontWeight: 400 }}>
        Choisissez une heure : le rendez-vous est déplacé aussitôt et le
        professionnel est prévenu. Tant que le délai ci-dessus tient, vous
        pouvez en changer à nouveau.
      </p>

      <div className="row row--between row-3 row--wrap">
        <span className="t-caption t-dim">
          Du {dayLabel(at.from)} au {dayLabel(at.to)}
        </span>
        <div className="row row-2">
          {at.from > at.today ? (
            <Button
              label="Semaine précédente"
              variant="ghost"
              size="sm"
              icon="chevron-left"
              href={moveHref(
                booking.reference,
                laterOf(at.today, addDays(at.from, -WINDOW_DAYS)),
              )}
            />
          ) : null}
          <Button
            label="Semaine suivante"
            variant="ghost"
            size="sm"
            iconEnd="chevron-right"
            href={moveHref(booking.reference, addDays(at.from, WINDOW_DAYS))}
          />
        </div>
      </div>

      {at.groups.length === 0 ? (
        <EmptyState
          compact
          sketch="chair"
          title="Rien de libre cette semaine"
          body={`Il n’y a plus de place du ${dayLabel(at.from)} au ${dayLabel(at.to)}. La semaine suivante est souvent plus ouverte, et votre rendez-vous actuel reste réservé tant que vous n’en changez pas.`}
          action={
            <Button
              label="Voir la semaine suivante"
              variant="secondary"
              iconEnd="chevron-right"
              href={moveHref(booking.reference, addDays(at.from, WINDOW_DAYS))}
            />
          }
        />
      ) : (
        at.groups.map((group) => (
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
                <button
                  key={slot.starts_at}
                  className="slot"
                  type="submit"
                  name="starts_at"
                  value={slot.starts_at}
                  // The visible label is an hour, which says nothing on its own
                  // to somebody hearing the page rather than seeing the grid it
                  // sits in - and this button is not a navigation, it moves an
                  // appointment.
                  aria-label={`Déplacer ce rendez-vous au ${dayLabel(group.date)} à ${time(slot.starts_at, zone)}`}
                >
                  {time(slot.starts_at, zone)}
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {at.more ? (
        <p className="t-caption t-dim">
          Cette semaine compte plus de créneaux que la page n’en montre. Les
          jours suivants en ont d’autres.
        </p>
      ) : null}
    </form>
  );
}

/**
 * The slots this appointment could move to.
 *
 * <p>`available-slots` is asked about a service offering, and the booking a
 * customer holds carries the service's NAME and not its identifier - the
 * reference is meant to be the only handle they hold, so no second one is
 * published to them. The offering is therefore recovered from the provider's
 * own public page by that name, and the same for the colleague.
 *
 * <p>Null rather than a throw when there is nothing to match against. A
 * suspended business still owes an answer on the booking it took while its
 * public page has stopped resolving, and a withdrawn service has no slots to
 * offer at all - in both cases this page keeps rendering and says to telephone.
 */
async function loadMove(
  booking: CustomerBooking,
  asked: string | undefined,
): Promise<MoveWindow | null> {
  const slug = encodeURIComponent(booking.provider_slug);

  let provider: PublicProvider;
  let team: PublicStaffList;
  try {
    [provider, team] = await Promise.all([
      publicApi<PublicProvider>(`/v1/providers/${slug}`),
      publicApi<PublicStaffList>(`/v1/providers/${slug}/staff`),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }

  const service = provider.services.find((one) => one.name === booking.service_name);
  if (!service) return null;

  // Omitted when the colleague is no longer published as bookable: the server
  // keeps the same person on a move whatever this asks, so the worst case is a
  // slot the team has and they do not, which comes back as SLOT_UNAVAILABLE
  // and is said out loud rather than silently moving somebody else's diary.
  const person = team.data.find((one) => one.display_name === booking.staff_name);

  const zone = booking.timezone;
  // Today where the salon is, not where this process runs: `from` and `to` are
  // dates in the provider's own zone by the contract's own words.
  const today = calendarDay(new Date(), zone);
  const from = asked && DATE.test(asked) && asked >= today ? asked : today;
  const to = addDays(from, WINDOW_DAYS - 1);

  const slots = await publicApi<AvailableSlotPage>(
    `/v1/providers/${slug}/available-slots`,
    {
      query: {
        service_offering_id: service.service_offering_id,
        staff_id: person?.staff_id,
        from,
        to,
        limit: 200,
      },
    },
  );

  return {
    today,
    from,
    to,
    groups: groupByDay(slots.data, zone),
    // Null on the last page, not absent, so this is a truthiness test and not
    // a comparison against undefined that would be true every time.
    more: Boolean(slots.next_cursor),
  };
}

/** This page, with the slot list open on a given week. */
function moveHref(reference: string, date?: string): string {
  const query = new URLSearchParams({ move: "1" });
  if (date) query.set("date", date);
  // The fragment is what keeps a customer where they were reading: opening the
  // list is a navigation, and a navigation otherwise lands them at the title.
  return `/bookings/${encodeURIComponent(reference)}?${query.toString()}#move`;
}

/* --- Reporting ----------------------------------------------------------- */

/**
 * Telling the platform, which is not telling the salon.
 *
 * <p>Last on the page and quiet on purpose. It is not a competitor of the
 * appointment details, and a report button drawn as loudly as "annuler" invites
 * the press that was meant for the other one.
 *
 * <p>Folded away until asked for, because the five reasons are worth reading
 * only to somebody who has already decided they have one.
 */
function ReportSection({ booking, query }: { booking: CustomerBooking; query: Search }) {
  return (
    <section className="stack stack-3" id="report" aria-labelledby="report-head">
      <div className="row row-3">
        <span className="rule-accent" aria-hidden="true" />
        <h2 className="t-label" id="report-head">
          Signaler un problème
        </h2>
      </div>
      <p className="t-caption t-dim">
        Ce signalement arrive à Balaaca et pas au salon : le professionnel n’en
        est pas informé et ne peut pas le lire. Il ne remplace pas un appel si
        vous attendez une réponse de sa part.
      </p>

      {query.report === "1" ? (
        <form className="stack stack-4" action={reportProvider}>
          <input type="hidden" name="reference" value={booking.reference} />

          <div className="field">
            <label className="field__label" htmlFor="report-reason">
              Que s’est-il passé ?
              <span className="field__req" aria-hidden="true">*</span>
            </label>
            {/* An empty first option rather than a preselected reason: a select
                that opens on "Le salon était fermé" is a report already half
                written by the page. `required` refuses the empty one. */}
            <select
              className="select"
              id="report-reason"
              name="reason"
              defaultValue=""
              required
            >
              <option value="">Choisissez un motif</option>
              {REASONS.map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="report-details">
              En quelques mots{" "}
              <span className="t-caption t-dim" style={{ fontWeight: 500 }}>
                facultatif
              </span>
            </label>
            <textarea
              className="textarea"
              id="report-details"
              name="details"
              rows={3}
              maxLength={1000}
              placeholder="Ex. la boutique était fermée à l’heure du rendez-vous."
              aria-describedby="report-details-hint"
            />
            <p className="field__hint" id="report-details-hint">
              Mille caractères au plus. Personne ne vous demandera d’écrire une
              lettre pour dire qu’on vous a mal reçu.
            </p>
          </div>

          <ActionButton
            label="Envoyer le signalement"
            variant="quiet-danger"
            type="submit"
            icon="send"
          />
        </form>
      ) : (
        // A row rather than a bare stack child, so the link stays the width of
        // its own words. Stretched across the page it would read as the last
        // call to action on the screen, which is what it must not be.
        <div className="row row-2">
          <Button
            label="Signaler un problème"
            variant="ghost"
            size="sm"
            icon="alert-triangle"
            href={`/bookings/${encodeURIComponent(booking.reference)}?report=1#report`}
          />
        </div>
      )}
    </section>
  );
}

/* --- The ticket ---------------------------------------------------------- */

/**
 * The one line that says where things stand, under the title.
 *
 * <p>Written per status rather than once, because "vous attend" is a lie for a
 * request the salon has not looked at yet, and the mockup said it anyway.
 */
function lead(booking: CustomerBooking, zone: string): string {
  const when = `${day(booking.starts_at, zone)} à ${time(booking.starts_at, zone)}`;
  switch (booking.status) {
    case "PENDING":
      return `Votre demande est partie chez ${booking.provider_name} pour le ${when}.`;
    case "CONFIRMED":
      return `${booking.provider_name} vous attend le ${when}.`;
    case "CANCELLED":
      return `Ce rendez-vous chez ${booking.provider_name} est annulé.`;
    case "COMPLETED":
      return `Ce rendez-vous chez ${booking.provider_name} a eu lieu.`;
    default:
      return `Ce rendez-vous chez ${booking.provider_name} n’a pas été honoré.`;
  }
}

/** What the status means for the person reading, not what it means in the schema. */
const STATUS_NOTE: Record<string, string> = {
  PENDING:
    "Le professionnel confirme les rendez-vous à la main. Vous gardez votre place tant que ce n’est pas fait.",
  CONFIRMED: "C’est confirmé. Présentez-vous à l’heure, il n’y a rien d’autre à faire.",
  CANCELLED: "Le créneau a été rendu. Rien ne vous est dû ni demandé.",
  COMPLETED: "La prestation a été faite.",
  NO_SHOW: "Le professionnel a noté que ce rendez-vous n’a pas été honoré.",
};

function TicketRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="row row--top row-3">
      <span
        aria-hidden="true"
        style={{ color: "var(--text-tertiary)", flex: "none", marginTop: 1 }}
      >
        <Icon name={icon} size={17} />
      </span>
      <span className="grow stack" style={{ gap: 1 }}>
        <span className="t-caption t-dim">{label}</span>
        <span className="t-small" style={{ fontWeight: 600 }}>
          {value}
        </span>
        {hint ? <span className="t-caption t-dim">{hint}</span> : null}
      </span>
    </div>
  );
}

/**
 * "Africa/Conakry" as a place a person recognises.
 *
 * <p>The zone is the provider's own and travels with the booking, so this
 * never hardcodes a city - it just stops printing a slash and an underscore at
 * somebody who only wanted to know which clock the time is on.
 */
function placeOf(timeZone: string): string {
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replace(/_/g, " ");
}

/* --- Dates --------------------------------------------------------------- */

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
