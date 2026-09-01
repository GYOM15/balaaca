import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Icon, Scene } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";
import { Avatar, Wordmark } from "@/components/ui";
import { ApiError, publicApi } from "@/lib/api";
import { dateTime, day, mediaUrl, money, time } from "@/lib/format";
import type {
  AvailableSlotPage,
  CustomerBooking,
  Fulfilment,
  PublicProvider,
  PublicServiceOffering,
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

/**
 * The three shapes a service takes, written the way every other screen writes
 * them: same badge, same glyph, same sentence, from the result card to the
 * provider's own diary.
 *
 * <p>An unknown fulfilment reads as `ON_SITE` by the contract's own words, so a
 * fourth value shipped one day draws the shop rather than nothing.
 */
type Mode = { slug: string; icon: string; label: string; title: string; body: string };

const ON_SITE: Mode = {
  slug: "on-site",
  icon: "mode-onsite",
  label: "Sur place",
  title: "Sur place · Vous venez sur place",
  body: "Vous vous rendez chez le prestataire et la prestation est réalisée pendant que vous attendez.",
};

const MODES: Record<string, Mode> = {
  ON_SITE,
  DROP_OFF: {
    slug: "drop-off",
    icon: "mode-dropoff",
    label: "Dépôt",
    title: "Dépôt · Vous déposez, vous repassez",
    body: "",
  },
  AT_CUSTOMER: {
    slug: "at-customer",
    icon: "mode-atcustomer",
    label: "À domicile",
    title: "À domicile · Le prestataire se déplace",
    body: "Le prestataire se déplace jusqu’à l’adresse que vous indiquez.",
  },
};

function modeOf(fulfilment: Fulfilment): Mode {
  return MODES[fulfilment] ?? ON_SITE;
}

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
};

type Search = {
  error?: string;
  cancel?: string;
  cancelled?: string;
  move?: string;
  moved?: string;
  move_error?: string;
  date?: string;
  /** The slot the customer has picked but not yet confirmed. */
  at?: string;
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
 * question, owns the h1 that states it, and carries the mockup's reduced header
 * instead of the site's. They are query parameters rather than segments because
 * all four read the same appointment, and a segment would mean reading it again
 * per screen.
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
        : // Not gated on `changeable`, unlike the move: the deadline passing
          // between the render of the button and the press of it is exactly the
          // refusal this screen was drawn to state, and falling back to the
          // appointment would leave the question the customer asked unanswered.
          open && query.cancel === "1"
          ? "cancel"
          : "detail";

  // The booking carries the appointment and nothing about the place it is at.
  // Read only where a screen shows one: most people open this page to re-read a
  // reference and leave.
  const provider =
    view === "detail" || (view === "cancel" && !changeable)
      ? await loadProvider(booking)
      : null;
  const move = view === "move" ? await loadMove(booking, query.date) : null;

  if (view === "move") {
    return (
      <>
        <FocusHeader back={hrefOf(booking.reference)} label="Revenir à ma réservation" />
        <main id="contenu">
          <MoveView booking={booking} week={move} zone={zone} query={query} />
        </main>
      </>
    );
  }

  if (view === "cancel") {
    return (
      <>
        <FocusHeader back={hrefOf(booking.reference)} label="Revenir" />
        <main id="contenu">
          <CancelView
            booking={booking}
            provider={provider}
            zone={zone}
            refused={!changeable}
          />
        </main>
      </>
    );
  }

  if (view === "report") {
    return (
      <>
        <FocusHeader back={hrefOf(booking.reference)} label="Revenir" />
        <main id="contenu">
          <ReportView booking={booking} query={query} />
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main id="contenu" className="has-tabbar">
        <DetailView
          booking={booking}
          provider={provider}
          zone={zone}
          query={query}
          deadline={deadline}
          open={open}
          changeable={changeable}
        />
      </main>
      <SiteFooter />
      <TabBar active={"reservation"} />
    </>
  );
}

/* --- The appointment ----------------------------------------------------- */

/**
 * The appointment itself: with whom, what, by whom, when, how much.
 *
 * <p>Everything a customer needs on arriving, and nothing they have to press to
 * see. The two things that change it - the move and the cancellation - sit in
 * the card's foot, and only while the professional's own deadline still holds;
 * the way to reach a human sits beside them and stays for as long as the
 * appointment does.
 */
function DetailView({
  booking,
  provider,
  zone,
  query,
  deadline,
  open,
  changeable,
}: {
  booking: CustomerBooking;
  provider: PublicProvider | null;
  zone: string;
  query: Search;
  deadline: string | undefined;
  open: boolean;
  changeable: boolean;
}) {
  const base = hrefOf(booking.reference);
  const providerPage = `/p/${encodeURIComponent(booking.provider_slug)}`;
  const status = STATUS[booking.status];
  const service = serviceOf(provider, booking);
  const mode = service ? modeOf(service.fulfilment) : undefined;
  const logo = mediaUrl(provider?.logo_url);
  const place = provider ? placeOf(provider) : "";
  const whatsApp = provider?.whatsapp_phone_e164;
  // Suppressed right after the customer's own action: the flash above already
  // says "c'est annulé", and saying it twice reads as two different events.
  const note = query.cancelled ? undefined : statusNote(booking);

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
            <p className="t-overline">Réservation {booking.reference}</p>
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
          <Alert tone="success" icon="check-circle" title="C’est annulé.">
            Le créneau a été rendu. Vous pouvez reprendre rendez-vous quand vous
            voulez, sur la page du professionnel.
          </Alert>
        ) : null}

        {query.moved ? (
          <Alert tone="success" icon="check-circle" title="C’est déplacé.">
            Le rendez-vous ci-dessous porte la nouvelle heure, et le professionnel
            a été prévenu. L’ancien créneau a été rendu.
          </Alert>
        ) : null}

        {query.reported ? (
          <Alert tone="success" icon="check-circle" title="Le signalement est parti.">
            Balaaca l’a reçu. Le professionnel n’en est pas informé et ne peut pas
            le lire. Il n’y a rien d’autre à faire de votre côté, et rien à venir
            consulter ici.
          </Alert>
        ) : null}

        {query.error ? (
          <Alert
            tone="danger"
            icon="alert-circle"
            title="L’annulation n’a pas abouti"
            code={query.error}
          >
            {REFUSALS[query.error] ??
              "Réessayez dans un instant, ou appelez le professionnel : son numéro est sur sa page."}
          </Alert>
        ) : null}

        {note ? (
          <Alert
            tone={note.tone}
            icon={note.icon}
            title={note.title}
            actions={
              booking.status === "CANCELLED" ? (
                <Link
                  className="btn btn--primary btn--sm"
                  href={`/p/${encodeURIComponent(booking.provider_slug)}/reserver`}
                >
                  <span className="btn__label--idle">Reprendre rendez-vous</span>
                </Link>
              ) : undefined
            }
          >
            {note.body}
          </Alert>
        ) : null}

        <div className="card" style={{ marginTop: "var(--s-6)" }}>
          <div className="card__head" style={{ alignItems: "center", gap: "var(--s-4)" }}>
            {logo ? (
              <span className="avatar avatar--lg">
                {/* Plain img, not next/image: the bytes come through this
                    server's own /media route and are already sized. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" />
              </span>
            ) : (
              <Avatar name={booking.provider_name} size="lg" />
            )}
            <div className="grow">
              <div className="t-h4">{booking.provider_name}</div>
              {place ? (
                <div className="t-meta" style={{ marginTop: 2 }}>
                  <span>
                    <Icon name="pin" size={16} /> {place}
                  </span>
                </div>
              ) : null}
            </div>
            <Link className="btn btn--ghost btn--sm" href={providerPage}>
              <span className="btn__label--idle">Voir la page</span>
              <Icon name="arrow-right" size={18} className="ico--arrow" />
            </Link>
          </div>

          <div className="card__body">
            <div className="dl dl--lined">
              <div className="dl__row">
                <span className="dl__key">Quand</span>
                <span className="dl__val">
                  {day(booking.starts_at, zone)} à {time(booking.starts_at, zone)}
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
              {mode ? (
                <div className="dl__row">
                  <span className="dl__key">Déroulement</span>
                  <span className="dl__val">
                    <span className={`mode mode--${mode.slug} mode--lg`}>
                      <Icon name={mode.icon} />
                      {mode.label}
                    </span>
                  </span>
                </div>
              ) : null}
              {booking.ready_by ? (
                <div className="dl__row">
                  <span className="dl__key">Promesse de retrait</span>
                  <span className="dl__val">
                    {service?.turnaround_hours
                      ? `Prêt sous ${turnaround(service.turnaround_hours)}, soit le ${day(booking.ready_by, zone)}`
                      : day(booking.ready_by, zone)}
                  </span>
                </div>
              ) : null}
              {/* Restored: the port dropped it because the prototype's drop-off
                  screen has no such row. But ready_at is the moment the shop
                  says the work is done, and this page is the only place the
                  customer reads it - without it a garment can be waiting on a
                  counter for a week with nothing saying so. */}
              {booking.ready_at ? (
                <div className="dl__row">
                  <span className="dl__key">Prêt depuis</span>
                  <span className="dl__val">{dateTime(booking.ready_at, zone)}</span>
                </div>
              ) : null}
              {provider?.address_line ? (
                <div className="dl__row">
                  <span className="dl__key">Adresse</span>
                  <span className="dl__val" style={{ maxWidth: "30ch" }}>
                    {provider.address_line}
                  </span>
                </div>
              ) : null}
              {provider?.public_phone_e164 ? (
                <div className="dl__row">
                  <span className="dl__key">Téléphone</span>
                  <span className="dl__val">{provider.public_phone_e164}</span>
                </div>
              ) : null}
            </div>

            {service && mode ? (
              <div style={{ marginTop: "var(--s-6)" }}>
                <div className={`mode-note mode-note--${mode.slug}`}>
                  <span className="mode-note__icon">
                    <Icon name={mode.icon} size={24} />
                  </span>
                  <div>
                    <div className="mode-note__title">{mode.title}</div>
                    <div className="mode-note__body">
                      {service.fulfilment === "DROP_OFF" ? (
                        <>
                          Vous déposez l’article, vous repassez le récupérer une
                          fois le travail terminé.{" "}
                          {service.turnaround_hours ? (
                            <>
                              <strong>
                                Prêt sous {turnaround(service.turnaround_hours)}.
                              </strong>{" "}
                            </>
                          ) : null}
                          Le rendez-vous ci-dessus n’est que la remise au comptoir
                          ({duration(service.duration_minutes)}), ce n’est pas la
                          durée du travail.
                        </>
                      ) : (
                        mode.body
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {open && (changeable || whatsApp) ? (
            <div className="card__foot">
              <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
                {changeable ? (
                  <>
                    <Link className="btn btn--secondary" href={moveHref(booking.reference)}>
                      <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                        <Icon name="calendar" size={18} />
                      </span>
                      <span className="btn__label--idle">Déplacer</span>
                    </Link>
                    <Link className="btn btn--ghost" href={`${base}?cancel=1`}>
                      <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                        <Icon name="x-circle" size={18} />
                      </span>
                      <span className="btn__label--idle">Annuler</span>
                    </Link>
                  </>
                ) : null}
                <span className="grow" />
                {whatsApp ? (
                  <a className="btn btn--ghost" href={whatsAppHref(whatsApp)}>
                    <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                      <Icon name="whatsapp" size={18} />
                    </span>
                    <span className="btn__label--idle">WhatsApp</span>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {open && !deadline ? (
          <Alert
            tone="warning"
            icon="alert-triangle"
            title="Les changements en ligne sont fermés"
          >
            Le délai fixé par le professionnel est passé : ce rendez-vous ne peut
            plus être déplacé ni annulé depuis cette page. Si vous avez un
            empêchement, appelez-le : son numéro est sur sa page, et prévenir vaut
            mieux que ne pas venir.
          </Alert>
        ) : null}

        {/* The report is secondary and stays that way: a quiet line under
            the card, never a button the size of "Annuler". */}
        <div
          className="row row--between"
          style={{ marginTop: "var(--s-8)", gap: "var(--s-4)", flexWrap: "wrap" }}
        >
          <p className="t-xs" style={{ maxWidth: "44ch" }}>
            Votre nom et votre numéro sont conservés par {booking.provider_name},
            chez qui vous avez réservé.{" "}
            <Link className="link" href="/confidentialite">
              En savoir plus
            </Link>
          </p>
          <Link className="btn btn--ghost btn--sm" href={`${base}?report=1`}>
            <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
              <Icon name="flag" size={18} />
            </span>
            <span className="btn__label--idle">Signaler un problème</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/** What the status means for the person reading, not what it means in the schema. */
function statusNote(
  booking: CustomerBooking,
): { tone: string; icon: string; title: string; body: string } | undefined {
  if (booking.status === "PENDING") {
    return {
      tone: "warning",
      icon: "alert-triangle",
      title: "En attente de confirmation",
      // No "dans la journée": how fast this business answers is not a figure
      // the API publishes, and a promise the platform cannot keep is worse
      // than no promise.
      body: `${booking.provider_name} confirme les rendez-vous à la main. Vous recevrez un message WhatsApp.`,
    };
  }
  if (booking.status === "CANCELLED") {
    return {
      tone: "neutral",
      icon: "info",
      title: "Ce rendez-vous a été annulé",
      body: "Vous pouvez reprendre un créneau quand vous voulez, aux mêmes conditions.",
    };
  }
  if (booking.status === "COMPLETED") {
    return {
      tone: "neutral",
      icon: "check-circle",
      title: "Ce rendez-vous a eu lieu",
      body: "La prestation a été faite. Il n’y a rien d’autre à faire de votre côté.",
    };
  }
  if (booking.status === "NO_SHOW") {
    return {
      tone: "neutral",
      icon: "alert-circle",
      title: "Ce rendez-vous n’a pas été honoré",
      body: "Le professionnel a noté que personne ne s’est présenté. Si c’est une erreur, signalez-le ci-dessous.",
    };
  }
  return undefined;
}

/* --- Moving -------------------------------------------------------------- */

/**
 * The day strip, the hours of the day it selects, and one button that commits.
 *
 * <p>Two taps and not one. The slot is picked in the URL and confirmed
 * afterwards, because a grid where every hour is a submit button gives a
 * customer no way to change their mind between reading the time and moving
 * their appointment - and no way to see, before it happens, what they are about
 * to move it to.
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
        <Alert
          tone="danger"
          icon="alert-circle"
          title="Le déplacement n’a pas abouti"
          code={query.move_error}
        >
          {MOVE_REFUSALS[query.move_error] ??
            "Réessayez dans un instant, ou appelez le professionnel : son numéro est sur sa page."}
        </Alert>
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
        <Alert
          tone="warning"
          icon="alert-triangle"
          title="Le déplacement en ligne n’est pas possible"
          actions={
            <Link className="btn btn--secondary btn--sm" href={base}>
              <span className="btn__label--idle">Revenir à ma réservation</span>
            </Link>
          }
        >
          Cette prestation n’est plus proposée en ligne, alors la plateforme ne
          sait plus quels créneaux vous proposer. Appelez le professionnel : son
          numéro est sur sa page, et il déplacera le rendez-vous lui-même.
        </Alert>
      ) : (
        <MoveForm booking={booking} week={at} zone={zone} picked={query.at} />
      )}
    </div>
  );
}

function MoveForm({
  booking,
  week: at,
  zone,
  picked,
}: {
  booking: CustomerBooking;
  week: MoveWindow;
  zone: string;
  picked: string | undefined;
}) {
  const base = hrefOf(booking.reference);
  const counts = new Map(at.groups.map((group) => [group.date, group.slots.length]));
  const days = Array.from({ length: WINDOW_DAYS }, (_, index) => addDays(at.from, index));
  const chosen = at.groups.find((group) => group.date === at.from);
  // Only a slot the API just published can be confirmed: `at` arrives in a URL,
  // and a starts_at nobody offered would be a refusal dressed as a button.
  const selected = chosen?.slots.some((slot) => slot.starts_at === picked) ? picked : undefined;

  return (
    <form action={rescheduleBooking}>
      <input type="hidden" name="reference" value={booking.reference} />
      {/* The day being read, so a refusal comes back to this same day. */}
      <input type="hidden" name="date" value={at.from} />
      <input type="hidden" name="starts_at" value={selected ?? ""} />

      <div style={{ marginTop: "var(--s-8)" }}>
        <div className="slots__label">
          <Icon name="calendar" size={16} /> Choisir un nouveau jour
        </div>

        {/* Not on the mockup's own move screen, which draws seven days and no
            way past them. It is the mockup's date picker, moved here: without
            it a customer whose week is full cannot move their appointment at
            all. */}
        <div className="row row--between" style={{ marginBottom: "var(--s-4)" }}>
          <span className="t-strong">{monthLabel(at.from, at.to)}</span>
          <span className="row" style={{ gap: "var(--s-1)" }}>
            {at.from > at.today ? (
              <Link
                className="btn btn--ghost btn--sm btn--icon"
                href={moveHref(
                  booking.reference,
                  laterOf(at.today, addDays(at.from, -WINDOW_DAYS)),
                )}
                aria-label="Semaine précédente"
              >
                <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                  <Icon name="chevron-left" size={18} />
                </span>
              </Link>
            ) : null}
            <Link
              className="btn btn--ghost btn--sm btn--icon"
              href={moveHref(booking.reference, addDays(at.from, WINDOW_DAYS))}
              aria-label="Semaine suivante"
            >
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="chevron-right" size={18} />
              </span>
            </Link>
          </span>
        </div>

        <div className="daystrip">
          {days.map((date) => {
            const free = counts.get(date) ?? 0;
            const current = date === at.from;
            return (
              <Link
                className={`day ${current ? "is-active" : free === 0 ? "is-full" : ""}`.trim()}
                href={moveHref(booking.reference, date)}
                key={date}
                aria-current={current ? "date" : undefined}
              >
                <span className="day__dow">{shortDow(date)}</span>
                <span className="day__num">{dayNumber(date)}</span>
                <span className="day__free">{freeLabel(free)}</span>
              </Link>
            );
          })}
        </div>

        {chosen === undefined ? (
          <div className="empty" style={{ marginTop: "var(--s-6)" }}>
            <Scene name="chair" className="scene-ill scene-ill--sm" />
            <div className="empty__title">Rien de libre ce jour-là</div>
            <p className="empty__body">
              Il n’y a plus de place le {dayLabel(at.from)}. Choisissez un autre
              jour ci-dessus : votre rendez-vous actuel reste réservé tant que
              vous n’en changez pas.
            </p>
          </div>
        ) : (
          partsOfDay(chosen.slots, zone).map((part, index) => (
            <div
              className="slots__group"
              key={part.label}
              style={index === 0 ? { marginTop: "var(--s-6)" } : undefined}
            >
              <div className="slots__label">
                <Icon name={part.icon} size={16} /> {part.label}
              </div>
              <div className="slots">
                {part.slots.map((slot) => (
                  <Link
                    key={slot.starts_at}
                    className={slot.starts_at === selected ? "slot is-selected" : "slot"}
                    href={moveHref(booking.reference, at.from, slot.starts_at)}
                    aria-current={slot.starts_at === selected ? "true" : undefined}
                  >
                    {time(slot.starts_at, zone)}
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="row row--wrap" style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}>
        <Link className="btn btn--ghost" href={base}>
          <span className="btn__label--idle">Annuler la modification</span>
        </Link>
        <span className="grow" />
        <button className="btn btn--primary btn--lg" type="submit" disabled={!selected}>
          <span className="btn__label--idle">Confirmer le nouvel horaire</span>
          <span className="btn__icon--busy">
            <Icon name="loader" size={18} className="ico--spin" />
          </span>
          <span className="btn__label--busy">Déplacement…</span>
          <span className="btn__icon--done">
            <Icon name="check" size={18} />
          </span>
          <span className="btn__label--done">Déplacé</span>
        </button>
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

  return { today, from, to, groups: groupByDay(slots.data, zone) };
}

/** This page, with the slot list open on a given day and a slot picked out. */
function moveHref(reference: string, date?: string, at?: string): string {
  const query = new URLSearchParams({ move: "1" });
  if (date) query.set("date", date);
  if (at) query.set("at", at);
  return `${hrefOf(reference)}?${query.toString()}`;
}

/* --- Cancelling ---------------------------------------------------------- */

/**
 * The one question, and the recap that answers "which one?" before it.
 *
 * <p>A screen of its own rather than a form under the appointment, because a
 * red button permanently below a confirmed rendezvous is an invitation, and
 * this one should be reached on purpose.
 *
 * <p>`refused` is the same screen with the answer already given: the deadline
 * went by, the button is dead, and the way through is the telephone.
 */
function CancelView({
  booking,
  provider,
  zone,
  refused,
}: {
  booking: CustomerBooking;
  provider: PublicProvider | null;
  zone: string;
  refused: boolean;
}) {
  const base = hrefOf(booking.reference);
  const whatsApp = provider?.whatsapp_phone_e164;

  return (
    <div className="page page--narrow" style={{ paddingBlock: "var(--s-10) var(--s-16)" }}>
      <h1 className="t-h2">Annuler ce rendez-vous&nbsp;?</h1>
      <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
        Le créneau sera immédiatement rendu disponible à d’autres clients. Vous
        pourrez reprendre rendez-vous, mais peut-être pas au même horaire.
      </p>

      {refused ? (
        <Alert
          tone="danger"
          icon="alert-circle"
          title="Le délai d’annulation est dépassé"
          code="CANCELLATION_DEADLINE_PASSED"
          actions={
            whatsApp ? (
              <a className="btn btn--secondary btn--sm" href={whatsAppHref(whatsApp)}>
                <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                  <Icon name="whatsapp" size={18} />
                </span>
                <span className="btn__label--idle">Écrire au salon sur WhatsApp</span>
              </a>
            ) : undefined
          }
        >
          Appelez directement le prestataire pour convenir d’une solution.
        </Alert>
      ) : null}

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
              Un mot pour le salon
              <span className="field__optional">facultatif</span>
            </label>
            <textarea
              className="textarea"
              id="reason"
              name="reason"
              maxLength={200}
              placeholder="Empêchement de dernière minute, je reprendrai la semaine prochaine."
            />
          </div>
        </div>
        <div className="row row--wrap" style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}>
          <Link className="btn btn--secondary" href={base}>
            <span className="btn__label--idle">Garder mon rendez-vous</span>
          </Link>
          <span className="grow" />
          <button className="btn btn--danger" type="submit" disabled={refused}>
            <span className="btn__label--idle">Annuler le rendez-vous</span>
            {refused ? null : (
              <>
                <span className="btn__icon--busy">
                  <Icon name="loader" size={18} className="ico--spin" />
                </span>
                <span className="btn__label--busy">Annulation…</span>
                <span className="btn__icon--done">
                  <Icon name="check" size={18} />
                </span>
                <span className="btn__label--done">Annulé</span>
              </>
            )}
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
      <h1 className="t-h2">Signaler un problème</h1>
      {/* The mockup's middle sentence was "Le prestataire pourra y répondre",
          which the contract denies in as many words: the provider can never
          read a report. The other two are the mockup's, unchanged. */}
      <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
        Votre signalement est lu par l’équipe Balaaca. Le prestataire n’en est
        pas informé et ne peut pas le lire. Cela ne remplace pas un appel si le
        problème est urgent.
      </p>

      {query.report_error ? (
        <Alert
          tone="danger"
          icon="alert-circle"
          title="Le signalement n’est pas parti"
          code={query.report_error}
        >
          {REPORT_REFUSALS[query.report_error] ?? "Réessayez dans un instant."}
        </Alert>
      ) : null}

      <form
        action={reportProvider}
        className="stack"
        style={{ marginTop: "var(--s-8)", "--stack-gap": "var(--s-6)" } as CSSProperties}
      >
        <input type="hidden" name="reference" value={booking.reference} />

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ padding: 0, marginBottom: "var(--s-3)" }}>
            Que s’est-il passé&nbsp;?
          </legend>
          {/* Nothing preselected: the mockup ticks the first choice to show
              what a ticked choice looks like, and a report half-written by the
              page is not the report the person came to make. */}
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

        <div className="field">
          <label className="field__label" htmlFor="report-details">
            Décrivez ce qui s’est passé
            <span className="field__req" aria-hidden="true">
              *
            </span>
          </label>
          <textarea
            className="textarea"
            id="report-details"
            name="details"
            required
            maxLength={1000}
            style={{ minHeight: 140 }}
            aria-describedby="report-details-hint"
          />
          <p className="field__hint" id="report-details-hint">
            Restez factuel : dates, heures, ce qui a été dit. Cela aide beaucoup.
          </p>
        </div>

        <div className="row row--wrap" style={{ gap: "var(--s-3)" }}>
          <Link className="btn btn--ghost" href={base}>
            <span className="btn__label--idle">Retour</span>
          </Link>
          <span className="grow" />
          <button className="btn btn--primary" type="submit">
            <span className="btn__label--idle">Envoyer le signalement</span>
            <span className="btn__icon--busy">
              <Icon name="loader" size={18} className="ico--spin" />
            </span>
            <span className="btn__label--busy">Envoi…</span>
            <span className="btn__icon--done">
              <Icon name="check" size={18} />
            </span>
            <span className="btn__label--done">Envoyé</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/* --- Shared pieces ------------------------------------------------------- */

/**
 * The header of a screen that asks one question.
 *
 * <p>No navigation and no footer: the three screens that move, cancel or report
 * are somewhere a customer arrived on purpose, and the only way out that
 * belongs on them is the way back.
 */
function FocusHeader({ back, label }: { back: string; label: string }) {
  return (
    <header className="hdr">
      <div className="page hdr__in">
        <Wordmark size={34} />
        <div className="hdr__actions">
          <Link className="hdr__link" href={back}>
            {label}
          </Link>
          <span className="t-xs" style={{ display: "none" }} data-show-md>
            Besoin d’aide&nbsp;?{" "}
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
  );
}


/**
 * A sentence the page needs the reader to take in, said once.
 *
 * <p>Written out rather than taken from `ui.tsx`: the mockup hangs the API's
 * own error code on the refusals as `data-error-code`, which is what lets a
 * queue of screenshots be read back against the contract, and `Notice` has
 * nowhere to put it.
 *
 * <p>`role=alert` only for a refusal: a screen reader interrupts on alert, and
 * a confirmation that interrupts is one nobody wants twice.
 */
function Alert({
  tone,
  icon,
  title,
  code,
  actions,
  children,
}: {
  tone: string;
  icon: string;
  title: string;
  code?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ marginTop: "var(--s-6)" }}>
      <div
        className={`alert alert--${tone}`}
        role={tone === "danger" ? "alert" : "status"}
        data-error-code={code}
      >
        <span className="alert__icon">
          <Icon name={icon} />
        </span>
        <div className="grow">
          <div className="alert__title">{title}</div>
          <div className="alert__body">{children}</div>
          {actions ? <div className="alert__actions">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The place the appointment is at, which the booking does not carry.
 *
 * <p>A 404 is not an error here: a suspended business still owes an answer on
 * the booking it took, while its public page has stopped resolving. The card
 * then draws the name, the hour and the price, and says nothing it cannot.
 */
async function loadProvider(booking: CustomerBooking): Promise<PublicProvider | null> {
  try {
    return await publicApi<PublicProvider>(
      `/v1/providers/${encodeURIComponent(booking.provider_slug)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** The offering this appointment is of, matched the way the move matches it. */
function serviceOf(
  provider: PublicProvider | null,
  booking: CustomerBooking,
): PublicServiceOffering | undefined {
  return provider?.services.find((one) => one.name === booking.service_name);
}

/**
 * Where the business is, finest first.
 *
 * <p>`city` is the field the contract deprecated and it stands in only for a
 * provider registered before the published map existed.
 */
function placeOf(provider: PublicProvider): string {
  return [provider.area, provider.locality?.label_fr ?? provider.city]
    .filter(Boolean)
    .join(", ");
}

/** This appointment's own URL. */
function hrefOf(reference: string): string {
  return `/bookings/${encodeURIComponent(reference)}`;
}

function whatsAppHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

/** How long the customer is there, or how long the handover takes. */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** "Prêt sous 1 semaine", from a promise the contract states in hours. */
function turnaround(hours: number): string {
  if (hours < 24 || hours % 24 !== 0) return `${hours} h`;
  const days = hours / 24;
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "1 semaine" : `${weeks} semaines`;
  }
  return days === 1 ? "1 jour" : `${days} jours`;
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

/**
 * One day's hours, in the two halves the design system draws.
 *
 * <p>Two and not three: morning and afternoon are the only parts of a day the
 * mockup names anywhere, and an evening group would need a word and a glyph
 * that were never drawn.
 */
function partsOfDay(
  slots: Slot[],
  timeZone: string,
): { label: string; icon: string; slots: Slot[] }[] {
  const morning = slots.filter((slot) => hourAt(slot.starts_at, timeZone) < 12);
  const afternoon = slots.filter((slot) => hourAt(slot.starts_at, timeZone) >= 12);
  return [
    { label: "Matin", icon: "sun", slots: morning },
    { label: "Après-midi", icon: "clock", slots: afternoon },
  ].filter((part) => part.slots.length > 0);
}

/** The hour an instant reads as at the salon. */
function hourAt(instant: string, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(
      new Date(instant),
    ),
  );
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

/** The month the shown days fall in, or both when they straddle two. */
function monthLabel(from: string, to: string): string {
  const start = written(from, { month: "long", year: "numeric" });
  const end = written(to, { month: "long", year: "numeric" });
  const both = start === end ? start : `${written(from, { month: "long" })} – ${end}`;
  // French writes its months in lower case wherever they are not opening a
  // line, and this one opens one.
  return both.charAt(0).toUpperCase() + both.slice(1);
}

function written(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("fr", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/**
 * How many hours a day still has.
 *
 * <p>"Aucun" and not "complet": an empty day may be a closed one or a full one,
 * and the slot list cannot tell the two apart.
 */
function freeLabel(free: number): string {
  if (free === 0) return "aucun";
  return free === 1 ? "1 libre" : `${free} libres`;
}
