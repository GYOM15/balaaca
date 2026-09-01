import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Icon, Scene } from "@/components/icon";
import { SiteFooter, SiteHeader } from "@/components/site";
import { initials } from "@/components/ui";
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
const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  {
    value: "NO_SHOW",
    label: "Le professionnel ne s’est pas présenté",
    hint: "Personne au rendez-vous, aucun message.",
  },
  {
    value: "NOT_AS_DESCRIBED",
    label: "La prestation n’était pas celle annoncée",
    hint: "Le contenu ou la durée ne correspondait pas.",
  },
  {
    value: "OVERCHARGED",
    label: "Le prix demandé était différent",
    hint: "Un montant autre que le prix figé a été réclamé.",
  },
  {
    value: "RUDE_OR_UNSAFE",
    label: "Comportement inacceptable",
    hint: "Propos ou attitude déplacés.",
  },
  { value: "OTHER", label: "Autre", hint: "Décrivez la situation ci-dessous." },
];

/**
 * The status, as the badge beside the title says it.
 *
 * <p>Never colour alone: every entry carries a glyph and a word, which is what
 * makes "annulé" readable to somebody who cannot tell the two greys apart.
 */
const STATUS: Record<string, { label: string; tone: string; icon: string }> = {
  PENDING: { label: "À confirmer", tone: "warning", icon: "hourglass" },
  CONFIRMED: { label: "Confirmé", tone: "brand", icon: "check-circle" },
  CANCELLED: { label: "Annulé", tone: "neutral", icon: "x-circle" },
  COMPLETED: { label: "Terminé", tone: "success", icon: "check-circle" },
  NO_SHOW: { label: "Non honoré", tone: "danger", icon: "alert-circle" },
};

/** What the status means for the person reading, not what it means in the schema. */
const STATUS_ALERT: Record<
  string,
  { tone: string; icon: string; title: string; body: string }
> = {
  PENDING: {
    tone: "warning",
    icon: "alert-triangle",
    title: "En attente de confirmation",
    body: "Le professionnel confirme les rendez-vous à la main. Vous gardez votre place tant que ce n’est pas fait.",
  },
  CANCELLED: {
    tone: "neutral",
    icon: "info",
    title: "Ce rendez-vous a été annulé",
    body: "Le créneau a été rendu. Vous pouvez reprendre un créneau quand vous voulez, aux mêmes conditions.",
  },
  COMPLETED: {
    tone: "neutral",
    icon: "check-circle",
    title: "Ce rendez-vous a eu lieu",
    body: "La prestation a été faite. Il n’y a rien d’autre à faire de votre côté.",
  },
  NO_SHOW: {
    tone: "neutral",
    icon: "alert-circle",
    title: "Ce rendez-vous n’a pas été honoré",
    body: "Le professionnel a noté que personne ne s’est présenté. Si c’est une erreur, signalez-le ci-dessous.",
  },
};

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
  cancel?: string;
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
 * <p>The same reference authorises three things and no more: reading this,
 * moving it, calling it off. The report at the bottom is the fourth, and it is
 * the one that goes somewhere other than the salon.
 *
 * <p>Four screens on one route. The mockup drew the move, the cancellation and
 * the report as pages of their own, and they are: each one asks a single
 * question and owns the h1 that states it. They are query parameters rather
 * than segments because all four read the same appointment, and a segment would
 * mean reading it again per screen.
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
  const changeable = open && Boolean(deadline);

  const view: "detail" | "move" | "cancel" | "report" =
    query.report === "1"
      ? "report"
      : changeable && query.move === "1"
        ? "move"
        : changeable && query.cancel === "1"
          ? "cancel"
          : "detail";

  // Three more calls, so they are made only when the customer has asked to see
  // slots. Most people open this page to re-read a reference and leave.
  const move = view === "move" ? await loadMove(booking, query.date) : null;

  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        {view === "move" ? (
          <MoveView booking={booking} week={move} zone={zone} query={query} />
        ) : view === "cancel" ? (
          <CancelView booking={booking} zone={zone} />
        ) : view === "report" ? (
          <ReportView booking={booking} query={query} />
        ) : (
          <DetailView
            booking={booking}
            zone={zone}
            query={query}
            deadline={deadline}
            open={open}
            changeable={changeable}
          />
        )}
      </main>

      <SiteFooter />
    </>
  );
}

/* --- The appointment ----------------------------------------------------- */

/**
 * The appointment itself: with whom, what, by whom, when, how much.
 *
 * <p>Everything a customer needs on arriving, and nothing they have to press to
 * see. The two things that change it - the move and the cancellation - sit in
 * the card's foot, and only while the professional's own deadline still holds.
 */
function DetailView({
  booking,
  zone,
  query,
  deadline,
  open,
  changeable,
}: {
  booking: CustomerBooking;
  zone: string;
  query: Search;
  deadline: string | undefined;
  open: boolean;
  changeable: boolean;
}) {
  const base = hrefOf(booking.reference);
  const providerPage = `/p/${encodeURIComponent(booking.provider_slug)}`;
  const status = STATUS[booking.status];
  // Suppressed right after the customer's own action: the flash above already
  // says "c'est annulé", and saying it twice reads as two different events.
  const note = query.cancelled ? undefined : STATUS_ALERT[booking.status];

  return (
    <section className="section atmo tex-dots" style={{ paddingBlock: "var(--s-8) var(--s-16)" }}>
      <div className="page page--narrow">
        <nav className="crumbs" aria-label="Fil d’Ariane">
          <Link href="/">Accueil</Link>
          <Icon name="chevron-right" />
          <span aria-current="page">Ma réservation</span>
        </nav>

        <div
          className="row row--between"
          style={{ marginTop: "var(--s-5)", alignItems: "flex-start", gap: "var(--s-4)" }}
        >
          <div>
            <p className="t-overline">Réservation</p>
            <h1 className="t-h2" style={{ marginTop: "var(--s-2)" }}>
              {booking.service_name}
            </h1>
          </div>
          <span className={`badge badge--${status?.tone ?? "neutral"}`}>
            <Icon name={status?.icon ?? "info"} />
            {status?.label ?? booking.status}
          </span>
        </div>

        {query.cancelled ? (
          <Flash tone="success" icon="check-circle" title="C’est annulé.">
            Le créneau a été rendu. Vous pouvez reprendre rendez-vous quand vous
            voulez, sur la page du professionnel.
          </Flash>
        ) : null}

        {query.moved ? (
          <Flash tone="success" icon="check-circle" title="C’est déplacé.">
            Le rendez-vous ci-dessous porte la nouvelle heure, et le professionnel
            a été prévenu. L’ancien créneau a été rendu.
          </Flash>
        ) : null}

        {query.reported ? (
          <Flash tone="success" icon="check-circle" title="Le signalement est parti.">
            Balaaca l’a reçu. Le professionnel n’en est pas informé et ne peut pas
            le lire. Il n’y a rien d’autre à faire de votre côté, et rien à venir
            consulter ici.
          </Flash>
        ) : null}

        {query.error ? (
          <Flash tone="danger" icon="alert-circle" title="L’annulation n’a pas abouti" alert>
            {REFUSALS[query.error] ??
              "Réessayez dans un instant, ou appelez le professionnel : son numéro est sur sa page."}
          </Flash>
        ) : null}

        {note ? (
          <div style={{ marginTop: "var(--s-6)" }}>
            <div className={`alert alert--${note.tone}`} role="status">
              <span className="alert__icon">
                <Icon name={note.icon} />
              </span>
              <div className="grow">
                <div className="alert__title">{note.title}</div>
                <div className="alert__body">{note.body}</div>
                {booking.status === "CANCELLED" ? (
                  <div className="alert__actions">
                    <Link className="btn btn--primary btn--sm" href={providerPage}>
                      Reprendre rendez-vous
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="card" style={{ marginTop: "var(--s-6)" }}>
          <div className="card__head" style={{ alignItems: "center", gap: "var(--s-4)" }}>
            <span className="avatar avatar--lg" aria-hidden="true">
              {initials(booking.provider_name)}
            </span>
            <div className="grow">
              <div className="t-h4">{booking.provider_name}</div>
            </div>
            <Link className="btn btn--ghost btn--sm" href={providerPage}>
              <span>Voir la page</span>
              <Icon name="arrow-right" size={16} className="ico--arrow" />
            </Link>
          </div>

          <div className="card__body">
            <div className="dl dl--lined">
              <div className="dl__row">
                <span className="dl__key">Quand</span>
                <span className="dl__val">{day(booking.starts_at, zone)}</span>
              </div>
              <div className="dl__row">
                <span className="dl__key">Heure</span>
                <span className="dl__val">
                  {time(booking.starts_at, zone)} – {time(booking.ends_at, zone)}
                  <br />
                  {/* An aunt in Paris booking for her niece in Conakry
                      otherwise reads an hour that is nobody's. */}
                  <span className="t-xs">Heure de {placeOf(zone)}</span>
                </span>
              </div>
              <div className="dl__row">
                <span className="dl__key">Avec</span>
                <span className="dl__val">{booking.staff_name}</span>
              </div>
              <div className="dl__row">
                <span className="dl__key">Prix figé</span>
                <span className="dl__val t-price">{money(booking.price)}</span>
              </div>
              {booking.ready_by ? (
                <div className="dl__row">
                  <span className="dl__key">Promesse de retrait</span>
                  <span className="dl__val">{dateTime(booking.ready_by, zone)}</span>
                </div>
              ) : null}
              {booking.ready_at ? (
                <div className="dl__row">
                  <span className="dl__key">Prêt depuis</span>
                  <span className="dl__val">{dateTime(booking.ready_at, zone)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {changeable ? (
            <div className="card__foot">
              <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
                <Link className="btn btn--secondary" href={moveHref(booking.reference)}>
                  <Icon name="calendar" size={18} />
                  <span>Déplacer</span>
                </Link>
                <Link className="btn btn--ghost" href={`${base}?cancel=1`}>
                  <Icon name="x-circle" size={18} />
                  <span>Annuler</span>
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {/* The reference is the only key: there is no account, and nobody
            else can hand it back. */}
        <div className="card card--pad" style={{ marginTop: "var(--s-6)" }}>
          <div className="row row--between row--wrap" style={{ gap: "var(--s-4)" }}>
            <div>
              <p className="t-overline">Votre référence</p>
              <div className="ref" style={{ marginTop: "var(--s-2)" }}>
                {booking.reference}
              </div>
            </div>
            <button className="btn btn--secondary" type="button" data-copy={booking.reference}>
              <Icon name="copy" size={18} />
              <span>Copier</span>
            </button>
          </div>
          <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
            Gardez-la. C’est le seul moyen de rouvrir cette page, et le lien de
            cette page la contient déjà.
          </p>
        </div>

        {open && !deadline ? (
          <div style={{ marginTop: "var(--s-6)" }}>
            <div className="alert alert--warning" role="status">
              <span className="alert__icon">
                <Icon name="alert-triangle" />
              </span>
              <div className="grow">
                <div className="alert__title">Les changements en ligne sont fermés</div>
                <div className="alert__body">
                  Le délai fixé par le professionnel est passé : ce rendez-vous ne
                  peut plus être déplacé ni annulé depuis cette page. Si vous avez
                  un empêchement, appelez-le : son numéro est sur sa page, et
                  prévenir vaut mieux que ne pas venir.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* The report is secondary and stays that way: a quiet line under
            the card, never a button the size of "Annuler". */}
        <div
          className="row row--between"
          style={{ marginTop: "var(--s-8)", gap: "var(--s-4)", flexWrap: "wrap" }}
        >
          <p className="t-xs" style={{ maxWidth: "44ch" }}>
            Un problème avec ce rendez-vous&nbsp;? Le signalement arrive à
            l’équipe Balaaca et non au professionnel : il n’en est pas informé et
            ne peut pas le lire. Il ne remplace pas un appel si vous attendez une
            réponse de sa part.
          </p>
          <Link className="btn btn--ghost btn--sm" href={`${base}?report=1`}>
            <Icon name="flag" size={16} />
            <span>Signaler un problème</span>
          </Link>
        </div>
      </div>
    </section>
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
function MoveView({
  booking,
  week: at,
  zone,
  query,
}: {
  booking: CustomerBooking;
  week: MoveWindow | null;
  zone: string;
  query: Search;
}) {
  const base = hrefOf(booking.reference);

  return (
    <div className="page page--narrow" style={{ paddingBlock: "var(--s-8) var(--s-16)" }}>
      <nav className="crumbs" aria-label="Fil d’Ariane">
        <Link href={base}>Ma réservation</Link>
        <Icon name="chevron-right" />
        <span aria-current="page">Déplacer</span>
      </nav>

      <h1 className="t-h2" style={{ marginTop: "var(--s-4)" }}>
        Déplacer votre rendez-vous
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
        Le prix et la prestation ne changent pas. Seul l’horaire est modifié.
      </p>

      {query.move_error ? (
        <Flash tone="danger" icon="alert-circle" title="Le déplacement n’a pas abouti" alert>
          {MOVE_REFUSALS[query.move_error] ??
            "Réessayez dans un instant, ou appelez le professionnel : son numéro est sur sa page."}
        </Flash>
      ) : null}

      <div
        className="card card--pad"
        style={{ marginTop: "var(--s-6)", background: "var(--bg-sunken)", boxShadow: "none" }}
      >
        <div className="dl">
          <div className="dl__row">
            <span className="dl__key">Actuellement</span>
            <span className="dl__val">
              {day(booking.starts_at, zone)} à {time(booking.starts_at, zone)}
            </span>
          </div>
          <div className="dl__row">
            <span className="dl__key">Prestation</span>
            <span className="dl__val">
              {booking.service_name} · {money(booking.price)}
            </span>
          </div>
        </div>
      </div>

      {at === null ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <div className="alert alert--warning" role="status">
            <span className="alert__icon">
              <Icon name="alert-triangle" />
            </span>
            <div className="grow">
              <div className="alert__title">Le déplacement en ligne n’est pas possible</div>
              <div className="alert__body">
                Cette prestation n’est plus proposée en ligne, alors la plateforme
                ne sait plus quels créneaux vous proposer. Appelez le
                professionnel : son numéro est sur sa page, et il déplacera le
                rendez-vous lui-même.
              </div>
              <div className="alert__actions">
                <Link className="btn btn--secondary btn--sm" href={base}>
                  Revenir à ma réservation
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <MoveForm booking={booking} week={at} zone={zone} />
      )}
    </div>
  );
}

function MoveForm({
  booking,
  week: at,
  zone,
}: {
  booking: CustomerBooking;
  week: MoveWindow;
  zone: string;
}) {
  const base = hrefOf(booking.reference);
  const counts = new Map(at.groups.map((group) => [group.date, group.slots.length]));
  const days = Array.from({ length: WINDOW_DAYS }, (_, index) => addDays(at.from, index));

  return (
    <form action={rescheduleBooking}>
      <input type="hidden" name="reference" value={booking.reference} />
      {/* The week being read, so a refusal comes back to this same week. */}
      <input type="hidden" name="date" value={at.from} />

      <p className="t-body" style={{ marginTop: "var(--s-8)" }}>
        Choisissez une heure : le rendez-vous est déplacé aussitôt et le
        professionnel est prévenu. Tant que le délai tient, vous pouvez en changer
        à nouveau.
      </p>

      <div
        className="row row--between row--wrap"
        style={{ marginTop: "var(--s-6)", gap: "var(--s-3)" }}
      >
        <span className="t-xs">
          Du {dayLabel(at.from)} au {dayLabel(at.to)}
        </span>
        <div className="row" style={{ gap: "var(--s-2)" }}>
          {at.from > at.today ? (
            <Link
              className="btn btn--ghost btn--sm"
              href={moveHref(
                booking.reference,
                laterOf(at.today, addDays(at.from, -WINDOW_DAYS)),
              )}
            >
              <Icon name="chevron-left" size={16} />
              <span>Semaine précédente</span>
            </Link>
          ) : null}
          <Link
            className="btn btn--ghost btn--sm"
            href={moveHref(booking.reference, addDays(at.from, WINDOW_DAYS))}
          >
            <span>Semaine suivante</span>
            <Icon name="chevron-right" size={16} />
          </Link>
        </div>
      </div>

      <div style={{ marginTop: "var(--s-6)" }}>
        <div className="slots__label">
          <Icon name="calendar" size={16} /> Choisir un nouveau jour
        </div>
        <div className="daystrip">
          {days.map((date) => {
            const free = counts.get(date) ?? 0;
            return (
              <a
                className={free === 0 ? "day is-full" : "day"}
                href={`#d-${date}`}
                key={date}
                aria-label={`${dayLabel(date)} : ${freeLabel(free)}`}
              >
                <span className="day__dow">{shortDow(date)}</span>
                <span className="day__num">{dayNumber(date)}</span>
                <span className="day__free">{freeLabel(free)}</span>
              </a>
            );
          })}
        </div>
      </div>

      {at.groups.length === 0 ? (
        <div className="empty" style={{ marginTop: "var(--s-8)" }}>
          <Scene name="chair" className="scene-ill scene-ill--sm" />
          <div className="empty__title">Rien de libre cette semaine</div>
          <p className="empty__body">
            Il n’y a plus de place du {dayLabel(at.from)} au {dayLabel(at.to)}. La
            semaine suivante est souvent plus ouverte, et votre rendez-vous actuel
            reste réservé tant que vous n’en changez pas.
          </p>
          <div className="empty__actions">
            <Link
              className="btn btn--secondary"
              href={moveHref(booking.reference, addDays(at.from, WINDOW_DAYS))}
            >
              <span>Voir la semaine suivante</span>
              <Icon name="chevron-right" size={18} />
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "var(--s-8)" }}>
          {at.groups.map((group) => (
            <div className="slots__group" id={`d-${group.date}`} key={group.date}>
              <div className="slots__label">
                <Icon name="calendar" size={16} /> {dayLabel(group.date)}
              </div>
              <div className="slots" role="group" aria-label={`Créneaux du ${dayLabel(group.date)}`}>
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
          ))}
        </div>
      )}

      {at.more ? (
        <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
          Cette semaine compte plus de créneaux que la page n’en montre. Les jours
          suivants en ont d’autres.
        </p>
      ) : null}

      <div className="row row--wrap" style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}>
        <Link className="btn btn--ghost" href={base}>
          Annuler la modification
        </Link>
      </div>
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
  return `${hrefOf(reference)}?${query.toString()}`;
}

/* --- Cancelling ---------------------------------------------------------- */

/**
 * The one question, and the recap that answers "which one?" before it.
 *
 * <p>A screen of its own rather than a form under the appointment, because a
 * red button permanently below a confirmed rendezvous is an invitation, and
 * this one should be reached on purpose.
 */
function CancelView({ booking, zone }: { booking: CustomerBooking; zone: string }) {
  const base = hrefOf(booking.reference);

  return (
    <div className="page page--narrow" style={{ paddingBlock: "var(--s-10) var(--s-16)" }}>
      <nav className="crumbs" aria-label="Fil d’Ariane">
        <Link href={base}>Ma réservation</Link>
        <Icon name="chevron-right" />
        <span aria-current="page">Annuler</span>
      </nav>

      <h1 className="t-h2" style={{ marginTop: "var(--s-4)" }}>
        Annuler ce rendez-vous&nbsp;?
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
        Le créneau sera immédiatement rendu disponible à d’autres clients. Vous
        pourrez reprendre rendez-vous, mais peut-être pas au même horaire.
      </p>

      <div
        className="card card--pad"
        style={{ marginTop: "var(--s-6)", background: "var(--bg-sunken)", boxShadow: "none" }}
      >
        <div className="dl">
          <div className="dl__row">
            <span className="dl__key">Prestation</span>
            <span className="dl__val">{booking.service_name}</span>
          </div>
          <div className="dl__row">
            <span className="dl__key">Quand</span>
            <span className="dl__val">
              {day(booking.starts_at, zone)} à {time(booking.starts_at, zone)}
            </span>
          </div>
          <div className="dl__row">
            <span className="dl__key">Chez</span>
            <span className="dl__val">{booking.provider_name}</span>
          </div>
        </div>
      </div>

      <form action={cancelBooking}>
        <input type="hidden" name="reference" value={booking.reference} />
        <div style={{ marginTop: "var(--s-6)" }}>
          <div className="field">
            <label className="field__label" htmlFor="reason">
              Un mot pour le professionnel
              <span className="field__optional">facultatif</span>
            </label>
            <textarea
              className="textarea"
              id="reason"
              name="reason"
              rows={2}
              maxLength={200}
              placeholder="Empêchement de dernière minute, je reprendrai la semaine prochaine."
              aria-describedby="reason-hint"
            />
            <p className="field__hint" id="reason-hint">
              Il le lira dans son agenda. Deux cents caractères au plus.
            </p>
          </div>
        </div>
        <div className="row row--wrap" style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}>
          <Link className="btn btn--secondary" href={base}>
            Garder mon rendez-vous
          </Link>
          <span className="grow" />
          <button className="btn btn--danger" type="submit">
            <Icon name="x-circle" size={18} />
            <span>Annuler le rendez-vous</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/* --- Reporting ----------------------------------------------------------- */

/**
 * Telling the platform, which is not telling the salon.
 *
 * <p>Reached from a quiet line at the foot of the appointment, and never
 * competing with it. The five reasons are worth reading only to somebody who
 * has already decided they have one.
 */
function ReportView({ booking, query }: { booking: CustomerBooking; query: Search }) {
  const base = hrefOf(booking.reference);

  return (
    <div className="page page--narrow" style={{ paddingBlock: "var(--s-10) var(--s-16)" }}>
      <nav className="crumbs" aria-label="Fil d’Ariane">
        <Link href={base}>Ma réservation</Link>
        <Icon name="chevron-right" />
        <span aria-current="page">Signaler</span>
      </nav>

      <h1 className="t-h2" style={{ marginTop: "var(--s-4)" }}>
        Signaler un problème
      </h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
        Votre signalement est lu par l’équipe Balaaca et non par le
        professionnel : il n’en est pas informé et ne peut pas le lire. Cela ne
        remplace pas un appel si le problème est urgent.
      </p>

      {query.report_error ? (
        <Flash tone="danger" icon="alert-circle" title="Le signalement n’est pas parti" alert>
          {REPORT_REFUSALS[query.report_error] ?? "Réessayez dans un instant."}
        </Flash>
      ) : null}

      <form action={reportProvider} style={{ marginTop: "var(--s-8)" }}>
        <input type="hidden" name="reference" value={booking.reference} />

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ padding: 0, marginBottom: "var(--s-3)" }}>
            Que s’est-il passé&nbsp;?
          </legend>
          {/* Nothing preselected: a report half-written by the page is not
              the report the person came to make. */}
          <div className="stack" style={{ "--stack-gap": "var(--s-2)" } as CSSProperties}>
            {REASONS.map((one) => (
              <label className="choice" key={one.value}>
                <input type="radio" name="reason" value={one.value} required />
                <span className="choice__mark">
                  <Icon name="check-circle" />
                </span>
                <span>
                  <span className="choice__title">{one.label}</span>
                  <span className="choice__desc">{one.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field" style={{ marginTop: "var(--s-6)" }}>
          <label className="field__label" htmlFor="report-details">
            Décrivez ce qui s’est passé
            <span className="field__optional">facultatif</span>
          </label>
          <textarea
            className="textarea"
            id="report-details"
            name="details"
            rows={3}
            maxLength={1000}
            style={{ minHeight: 140 }}
            aria-describedby="report-details-hint"
          />
          <p className="field__hint" id="report-details-hint">
            Restez factuel : dates, heures, ce qui a été dit. Mille caractères au
            plus, et personne ne vous demandera d’écrire une lettre pour dire
            qu’on vous a mal reçu.
          </p>
        </div>

        <div className="row row--wrap" style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}>
          <Link className="btn btn--ghost" href={base}>
            Retour
          </Link>
          <span className="grow" />
          <button className="btn btn--primary" type="submit">
            <Icon name="send" size={18} />
            <span>Envoyer le signalement</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/* --- Shared pieces ------------------------------------------------------- */

/**
 * What just happened, said once above the appointment.
 *
 * <p>`role=alert` only for a refusal: a screen reader interrupts on alert, and
 * a confirmation that interrupts is one nobody wants twice.
 */
function Flash({
  tone,
  icon,
  title,
  children,
  alert,
}: {
  tone: string;
  icon: string;
  title: string;
  children: ReactNode;
  alert?: boolean;
}) {
  return (
    <div style={{ marginTop: "var(--s-6)" }}>
      <div className={`alert alert--${tone}`} role={alert ? "alert" : "status"}>
        <span className="alert__icon">
          <Icon name={icon} />
        </span>
        <div className="grow">
          <div className="alert__title">{title}</div>
          <div className="alert__body">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** This appointment's own URL. */
function hrefOf(reference: string): string {
  return `/bookings/${encodeURIComponent(reference)}`;
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
  return written(date, { weekday: "long", day: "numeric", month: "long" });
}

/** The three letters the day strip shows above the number. */
function shortDow(date: string): string {
  return written(date, { weekday: "short" });
}

function dayNumber(date: string): string {
  return written(date, { day: "numeric" });
}

function written(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("fr", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/**
 * How many hours a day still has.
 *
 * <p>"Aucun" and not "fermé": an empty day may be a closed one or a full one,
 * and the slot list cannot tell the two apart.
 */
function freeLabel(free: number): string {
  if (free === 0) return "aucun";
  return free === 1 ? "1 libre" : `${free} libres`;
}
