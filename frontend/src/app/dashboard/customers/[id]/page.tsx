import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { ActionButton, EmptyState, Notice, STATUS, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { dateTime, day } from "@/lib/format";
import type { CustomerDetail, CustomerVisit, ProviderProfile } from "@/lib/types";
import { saveNotes } from "./actions";

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

type Query = {
  q?: string;
  error?: string;
};

/**
 * One person, and everything this business knows about them.
 *
 * <p>Three things, in the order a salon reaches for them: how to call them, what
 * they were told to remember, and what they have booked. The telephone number is
 * a `tel:` link because it is the whole reason the number was taken.
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
  const q = query.q?.trim() ?? "";

  const [provider, customer] = await Promise.all([
    api<ProviderProfile>("/v1/provider-profile"),
    fetchCustomer(id),
  ]);

  const zone = provider.timezone;
  const appointments = customer.history.length;

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <Link
            className="btn btn--ghost btn--icon btn--sm"
            href={listHref(q)}
            aria-label="Retour à la clientèle"
          >
            <Icon name="arrow-left" />
          </Link>
          <div>
            <h1 className="appbar__title">{customer.full_name}</h1>
            <div className="appbar__sub">
              {customer.visits} rendez-vous
              {customer.last_visit ? ` · dernier le ${day(customer.last_visit, zone)}` : ""}
            </div>
          </div>
          <div className="appbar__actions">
            <a className="btn btn--secondary btn--sm" href={`tel:${customer.phone}`}>
              <Icon name="phone" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">Appeler</span>
            </a>
            <a className="btn btn--secondary btn--sm" href={whatsapp(customer.phone)}>
              <Icon name="whatsapp" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      <main className="app__main has-tabbar" id="contenu">
        <div className="app__inner">
          {query.error ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="danger" title="La note n’a pas été enregistrée">
                {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
              </Notice>
            </div>
          ) : null}

          <div className="cols cols--main-aside">
            <div className="panel">
              <div className="panel__head">
                <div className="panel__title">Historique</div>
                <span className="t-xs">{appointments} rendez-vous</span>
              </div>

              {appointments === 0 ? (
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
                      <span className="dl__val">
                        <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                      </span>
                    </div>
                    {customer.email ? (
                      <div className="dl__row">
                        <span className="dl__key">E-mail</span>
                        <span className="dl__val">
                          <a href={`mailto:${customer.email}`}>{customer.email}</a>
                        </span>
                      </div>
                    ) : null}
                    <div className="dl__row">
                      <span className="dl__key">Rendez-vous</span>
                      <span className="dl__val">{customer.visits}</span>
                    </div>
                    <div className="dl__row">
                      <span className="dl__key">Dernière visite</span>
                      <span className="dl__val">
                        {customer.last_visit ? day(customer.last_visit, zone) : "Aucune"}
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
                    <input type="hidden" name="q" value={q} />
                    <textarea
                      className="textarea"
                      style={{ minHeight: "130px" }}
                      name="notes"
                      maxLength={MAX_NOTES}
                      defaultValue={customer.notes ?? ""}
                      aria-label="Note privée"
                      placeholder="Allergique à ce produit, arrive toujours en avance, préfère Mariam…"
                    />
                    <div className="t-xs" style={{ marginTop: "var(--s-3)" }}>
                      <Icon name="lock" size={16} /> Pour vous et votre équipe
                      seulement&nbsp;: cette personne ne la verra jamais. Videz le champ
                      pour l’effacer.
                    </div>
                    <div style={{ marginTop: "var(--s-4)" }}>
                      <ActionButton
                        label="Enregistrer la note"
                        variant="primary"
                        block
                        type="submit"
                      />
                    </div>
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
      <span className="choice__icon">
        <Icon name={STATUS[visit.status]?.icon ?? "clock"} size={18} />
      </span>
      <div className="grow">
        <div className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
          {visit.service_name}
        </div>
        <div className="t-xs" style={{ marginTop: "2px" }}>
          {dateTime(visit.starts_at, zone)} · {visit.staff_name}
        </div>
      </div>
      <StatusBadge status={visit.status} />
    </div>
  );
}

/** Back to the list, and back to the search that found this person. */
function listHref(q: string): string {
  return q ? `/dashboard/customers?q=${encodeURIComponent(q)}` : "/dashboard/customers";
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
