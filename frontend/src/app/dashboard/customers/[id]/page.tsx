import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import {
  ActionButton,
  EmptyState,
  Notice,
  SectionHead,
  StatusBadge,
} from "@/components/ui";
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

  return (
    <>
      <div className="pro-head stack stack-2">
        <div className="row row-3">
          <Link className="icon-btn" href={listHref(q)} aria-label="Retour à la clientèle">
            <Icon name="arrow-left" size={18} />
          </Link>
          <h1 className="pro-head__title grow">{customer.full_name}</h1>
        </div>
        <p className="t-small t-muted">
          {customer.visits > 1
            ? `${customer.visits} visites`
            : `${customer.visits} visite`}
          {customer.last_visit ? ` · Dernière visite ${day(customer.last_visit, zone)}` : ""}
        </p>
      </div>

      <div className="pro-body stack stack-8" id="contenu">
        {query.error ? (
          <Notice tone="danger" title="La note n’a pas été enregistrée">
            {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
          </Notice>
        ) : null}

        <section className="stack stack-4">
          <SectionHead label="Coordonnées" />
          <div className="recap">
            <div className="recap__row">
              <span className="recap__key">Téléphone</span>
              <span className="recap__val">
                <a href={`tel:${customer.phone}`}>{customer.phone}</a>
              </span>
            </div>
            {customer.email ? (
              <div className="recap__row">
                <span className="recap__key">E-mail</span>
                <span className="recap__val">
                  <a href={`mailto:${customer.email}`}>{customer.email}</a>
                </span>
              </div>
            ) : null}
            <div className="recap__row">
              <span className="recap__key">Rendez-vous pris</span>
              <span className="recap__val tnum">{customer.visits}</span>
            </div>
            <div className="recap__row">
              <span className="recap__key">Dernière visite</span>
              <span className="recap__val">
                {customer.last_visit ? day(customer.last_visit, zone) : "Aucune"}
              </span>
            </div>
          </div>
        </section>

        <section className="stack stack-4">
          <SectionHead label="Notes" />
          <form action={saveNotes} className="card card--pad-lg stack stack-4">
            <input type="hidden" name="id" value={customer.customer_id} />
            <input type="hidden" name="q" value={q} />
            <label className="field">
              <span className="field__label">Notes</span>
              <textarea
                className="textarea"
                name="notes"
                rows={4}
                maxLength={MAX_NOTES}
                defaultValue={customer.notes ?? ""}
                placeholder="Allergique à ce produit, arrive toujours en avance, préfère Mariam…"
              />
            </label>
            <p className="field__hint">
              <Icon name="lock" size={14} /> Pour vous et votre équipe seulement&nbsp;:
              cette personne ne la verra jamais. Videz le champ pour l’effacer.
            </p>
            <ActionButton label="Enregistrer" variant="primary" type="submit" icon="check" />
          </form>
        </section>

        <section className="stack stack-4">
          <SectionHead
            label="Historique"
            aside={
              customer.history.length > 0
                ? `${customer.history.length} rendez-vous`
                : undefined
            }
          />

          {customer.history.length === 0 ? (
            <EmptyState
              compact
              sketch="chair"
              title="Aucun rendez-vous"
              body="Cette personne est dans votre fichier sans avoir encore de rendez-vous à son nom."
            />
          ) : (
            <ul className="list list--boxed">
              {/* Most recent first, as the API sends it, and capped at fifty on
                  its side. Nothing is re-sorted here: a second opinion on the
                  order would be one that can disagree with the server's. */}
              {customer.history.map((visit, index) => (
                <li key={`${visit.starts_at}-${index}`}>
                  <Visit visit={visit} zone={zone} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
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
    <div className="list-row">
      <span className="grow stack stack-1">
        <span className="t-small">{visit.service_name}</span>
        <span className="t-caption t-dim">
          {dateTime(visit.starts_at, zone)} · {visit.staff_name}
        </span>
      </span>
      <StatusBadge status={visit.status} />
    </div>
  );
}

/** Back to the list, and back to the search that found this person. */
function listHref(q: string): string {
  return q ? `/dashboard/customers?q=${encodeURIComponent(q)}` : "/dashboard/customers";
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
