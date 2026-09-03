import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { EmptyState, Notice, STATUS, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { CustomerDetail, CustomerVisit, ProviderProfile } from "@/lib/types";
import { saveNotes, setBlocking } from "./actions";

/** A card that changes every time this person books. Cached, it would lie. */
export const dynamic = "force-dynamic";

/** The contract's ceiling on a note, so the field refuses before the server does. */
const MAX_NOTES = 2000;

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Cette fiche n’appartient pas à votre activité.",
  RESOURCE_NOT_FOUND: "Cette personne n’est plus dans votre fichier.",
  VALIDATION_FAILED: `La note est trop longue : ${MAX_NOTES} caractères au maximum.`,
  RATE_LIMITED: "Trop de demandes en même temps. Réessayez dans un instant.",
};

/**
 * Which of the two things on this card failed, so the note says so.
 *
 * <p>The card has two commands and they share one banner. A blocage that failed
 * under the heading "La note n’a pas été enregistrée" would send the provider
 * to the wrong field, and `VALIDATION_FAILED` does not mean the same thing on
 * both.
 */
const SUBJECTS: Record<string, { title: string; refusals: Record<string, string> }> = {
  blocage: {
    title: "Le blocage n’a pas été enregistré",
    refusals: { VALIDATION_FAILED: "Cette demande a été refusée. Rechargez la page." },
  },
};

type Query = {
  error?: string;
  for?: string;
};

/**
 * One person, and everything this business knows about them.
 *
 * <p>Three things, in the order a salon reaches for them: what they have
 * booked, how to reach them, and what they were told to remember.
 */
export default async function CustomerCard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const [provider, customer] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    fetchCustomer(id),
  ]);

  const zone = provider.timezone;

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <a
            className="btn btn--ghost btn--icon btn--sm hide-lg"
            href="#sections"
            aria-label="Menu"
          >
            <Icon name="menu" />
          </a>
          <div>
            <h1 className="appbar__title">{customer.full_name}</h1>
            {/* The design writes "Cliente depuis février 2024" here. Nothing
                serves a first visit, so the line says what is served. */}
            <div className="appbar__sub">
              {customer.visits} rendez-vous
              {customer.last_visit ? ` · dernier le ${longDay(customer.last_visit, zone)}` : ""}
            </div>
          </div>
          <div className="appbar__actions">
            <a className="btn btn--secondary btn--sm" href={whatsapp(customer.phone)}>
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="whatsapp" size={18} />
              </span>
              <span className="btn__label--idle">WhatsApp</span>
            </a>
            <Link className="btn btn--primary btn--sm" href="/dashboard#walkin">
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="plus" size={18} />
              </span>
              <span className="btn__label--idle">Nouveau rendez-vous</span>
            </Link>
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {query.error ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice
                tone="danger"
                errorCode={query.error}
                title={
                  SUBJECTS[query.for ?? ""]?.title ?? "La note n’a pas été enregistrée"
                }
              >
                {SUBJECTS[query.for ?? ""]?.refusals[query.error] ??
                  REFUSALS[query.error] ??
                  "Réessayez, ou rechargez la page."}
              </Notice>
            </div>
          ) : null}

          {customer.blocked ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="warning" icon="ban" title="Cette personne est bloquée">
                Elle ne peut plus prendre de rendez-vous sur votre page publique.
                Vous pouvez toujours l’inscrire vous-même au comptoir, et les
                rendez-vous déjà pris restent dans votre agenda.
              </Notice>
            </div>
          ) : null}

          <div className="cols cols--main-aside">
            <div className="stack" style={{ "--stack-gap": "var(--s-6)" } as React.CSSProperties}>
              <div className="panel">
                <div className="panel__head">
                  <div className="panel__title">Historique</div>
                  <span className="t-xs">{customer.visits} rendez-vous</span>
                </div>

                {customer.history.length === 0 ? (
                  <EmptyState
                    compact
                    sketch="chair"
                    title="Aucun rendez-vous"
                    body="Cette personne est dans votre fichier sans avoir encore de rendez-vous à son nom."
                  />
                ) : (
                  <div className="list" style={{ borderTop: 0 }}>
                    {/* Most recent first, as the API sends it, and capped at fifty on
                        its side. Nothing is re-sorted here: a second opinion on the
                        order would be one that can disagree with the server's. */}
                    {customer.history.map((visit, index) => (
                      <Visit key={`${visit.starts_at}-${index}`} visit={visit} zone={zone} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="sticky-aside" style={{ display: "grid", gap: "var(--s-5)" }}>
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Coordonnées</div>
                  </div>
                </div>
                <div className="card__body">
                  <div className="dl">
                    <div className="dl__row">
                      <span className="dl__key">Téléphone</span>
                      <span className="dl__val">{customer.phone}</span>
                    </div>
                    <div className="dl__row">
                      <span className="dl__key">Rendez-vous</span>
                      <span className="dl__val">{customer.visits}</span>
                    </div>
                    {/* The design's fourth row is "Première visite". The oldest
                        appointment is not served - the history stops at fifty -
                        so the row carries the one visit date that is. */}
                    <div className="dl__row">
                      <span className="dl__key">Dernière visite</span>
                      <span className="dl__val">
                        {customer.last_visit ? longDay(customer.last_visit, zone) : "Aucune"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Note privée</div>
                    <div className="panel__sub">Visible par vous seul</div>
                  </div>
                </div>
                <div className="card__body">
                  <form action={saveNotes}>
                    <input type="hidden" name="id" value={customer.customer_id} />
                    <textarea
                      className="textarea"
                      style={{ minHeight: "130px" }}
                      name="notes"
                      maxLength={MAX_NOTES}
                      defaultValue={customer.notes ?? ""}
                      aria-label="Note privée"
                    />
                    <div style={{ marginTop: "var(--s-4)" }}>
                      <button className="btn btn--primary btn--block" type="submit">
                        <span className="btn__label--idle">Enregistrer la note</span>
                        <span className="btn__icon--busy">
                          <Icon name="loader" size={18} className="ico--spin" />
                        </span>
                        <span className="btn__label--busy">Enregistrement…</span>
                        <span className="btn__icon--done">
                          <Icon name="check" size={18} />
                        </span>
                        <span className="btn__label--done">Enregistrée</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* The one lever a salon has against somebody who never turns up.
                  Last on the card, under the note, because it is the thing a
                  provider reaches for least and undoes most. */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <div className="panel__title">Réservation en ligne</div>
                    <div className="panel__sub">
                      {customer.blocked ? "Bloquée" : "Autorisée"}
                    </div>
                  </div>
                </div>
                <div className="card__body">
                  <p className="t-xs" style={{ marginTop: 0 }}>
                    {customer.blocked
                      ? "Cette personne ne peut pas réserver sur votre page publique. La débloquer lui rend cette possibilité."
                      : "Bloquer cette personne l’empêche de réserver sur votre page publique. Vous pourrez toujours l’inscrire vous-même, et ses rendez-vous déjà pris ne bougent pas."}
                  </p>
                  <form action={setBlocking} style={{ marginTop: "var(--s-4)" }}>
                    <input type="hidden" name="id" value={customer.customer_id} />
                    {/* The next state, not a flip of what this page last saw: a
                        card read a minute ago is not what is true now. */}
                    <input
                      type="hidden"
                      name="blocked"
                      value={customer.blocked ? "false" : "true"}
                    />
                    <button
                      className={`btn btn--block ${customer.blocked ? "btn--secondary" : "btn--danger"}`}
                      type="submit"
                    >
                      <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                        <Icon name={customer.blocked ? "user-check" : "ban"} size={18} />
                      </span>
                      <span className="btn__label--idle">
                        {customer.blocked ? "Débloquer" : "Bloquer la réservation en ligne"}
                      </span>
                      <span className="btn__icon--busy">
                        <Icon name="loader" size={18} className="ico--spin" />
                      </span>
                      <span className="btn__label--busy">Enregistrement…</span>
                      <span className="btn__icon--done">
                        <Icon name="check" size={18} />
                      </span>
                      <span className="btn__label--done">Enregistré</span>
                    </button>
                  </form>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * One past or future appointment.
 *
 * <p>The service is the name frozen at booking, not what the service is called
 * today - which is the point of freezing it, and why a card opened two years on
 * still says what was actually sold.
 */
function Visit({ visit, zone }: { visit: CustomerVisit; zone: string }) {
  return (
    <div className="list__item">
      <span className="choice__icon" style={{ background: "var(--bg-sunken)" }}>
        <Icon name={STATUS[visit.status]?.icon ?? "clock"} size={18} />
      </span>
      <div className="grow">
        <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
          {visit.service_name}
        </div>
        <div className="t-xs" style={{ marginTop: "2px" }}>
          {longDay(visit.starts_at, zone)}
        </div>
      </div>
      <StatusBadge status={visit.status} />
    </div>
  );
}

/**
 * A date without its weekday, which is how the design writes one here.
 * `format.ts` only has the long form, and this line is read at a glance rather
 * than out loud.
 */
function longDay(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr", { dateStyle: "long", timeZone }).format(
    new Date(instant),
  );
}

/**
 * The number, as WhatsApp addresses it.
 *
 * <p>Digits only, no plus. Whether this person is reachable there is not
 * something the API knows - it is the number they left, offered on the
 * application most of them answer on.
 */
function whatsapp(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

async function fetchCustomer(id: string): Promise<CustomerDetail> {
  try {
    return await api<CustomerDetail>(`/v1/customers/${encodeURIComponent(id)}`);
  } catch (error) {
    // The API answers one 404 for "does not exist" and "belongs to another
    // business" alike, and so does this page. An id the contract's pattern
    // rejects is a 400 that also names nobody, and a 500 would tell a mistyped
    // character that the product is broken.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
}
