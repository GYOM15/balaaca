import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { ActionButton, Button, Notice, StatusBadge } from "@/components/ui";
import { ApiError, publicApi } from "@/lib/api";
import { dateTime, day, money, time } from "@/lib/format";
import type { CustomerBooking } from "@/lib/types";
import { cancelBooking } from "./actions";

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
 */
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ error?: string; cancelled?: string }>;
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
  const deadline = booking.cancellable_until;
  // Still ahead of the customer, as opposed to over, called off, or missed.
  const open = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const providerPage = `/p/${encodeURIComponent(booking.provider_slug)}`;

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

        {query.error ? (
          <Notice tone="danger" title="L’annulation n’a pas abouti">
            {REFUSALS[query.error] ??
              "Réessayez dans un instant, ou appelez le professionnel : son numéro est sur sa page."}
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
          <Notice tone="warning" title="L’annulation en ligne est fermée">
            Le délai fixé par le professionnel est passé. Si vous avez un
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
      </main>
    </div>
  );
}

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
