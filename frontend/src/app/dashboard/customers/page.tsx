import Link from "next/link";
import { Icon } from "@/components/icon";
import { ActionButton, Avatar, Badge, Button, EmptyState, Notice, SectionHead } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import type { CustomerPage, CustomerSummary, ProviderProfile } from "@/lib/types";

/** An address book that grows on every booking. Cached, it would miss today's. */
export const dynamic = "force-dynamic";

/**
 * Below this the API refuses the search, and rightly: one character matches
 * most of an address book and answers nothing.
 */
const MIN_QUERY = 2;

/** The contract's own ceiling on `q`, so the field refuses before the server does. */
const MAX_QUERY = 120;

type Query = {
  q?: string;
  cursor?: string;
};

/**
 * Who this business has served.
 *
 * <p>The rows were there the whole time - `customers` has been filled on every
 * booking since the table existed and nothing ever read it back. A salon could
 * not find the person who telephoned yesterday, and could not tell a regular
 * from a first visit.
 *
 * <p>The search is a GET form, so a lookup is a URL: it can be bookmarked, sent
 * to a colleague, and the back button returns to the result rather than to an
 * empty box.
 */
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const searching = q.length >= MIN_QUERY;

  const [provider, customers] = await Promise.all([
    // For the zone alone. `last_visit` is an instant, and a date rendered in
    // the zone of whatever machine is drawing it can name the wrong day.
    api<ProviderProfile>("/v1/provider-profile"),
    api<CustomerPage>("/v1/customers", {
      query: {
        q: searching ? q : undefined,
        cursor: query.cursor || undefined,
        limit: 30,
      },
    }),
  ]);

  const zone = provider.timezone;
  const shown = customers.data.length;

  return (
    <>
      <div className="pro-head stack stack-2">
        <h1 className="pro-head__title">Clientèle</h1>
        <p className="t-small t-muted">
          Les personnes que vous avez déjà servies. Chaque réservation en
          inscrit une&nbsp;: ce fichier se remplit tout seul.
        </p>
      </div>

      <div className="pro-body stack stack-8" id="contenu">
        <section className="stack stack-4" aria-labelledby="search-title">
          <SectionHead label="Rechercher un client" />
          <form className="card card--pad stack stack-3" method="get" action="/dashboard/customers">
            {/* The cursor is deliberately absent from this form. A new search
                starts at the first page; carrying the old cursor would open it
                in the middle of a result set it does not belong to. */}
            <h2 className="t-caption t-dim" id="search-title">
              Un nom ou un numéro — celui des deux dont vous vous souvenez.
            </h2>
            <div className="row row-3 row--wrap" style={{ alignItems: "flex-end" }}>
              <div className="field grow" style={{ minWidth: "14rem" }}>
                <label className="field__label" htmlFor="customer-q">
                  Nom ou numéro
                </label>
                <input
                  className="input"
                  id="customer-q"
                  type="search"
                  name="q"
                  defaultValue={q}
                  maxLength={MAX_QUERY}
                  autoComplete="off"
                  placeholder="Aïssatou, 622…"
                />
              </div>
              <div className="row row-2 row--wrap">
                <ActionButton
                  label="Rechercher"
                  type="submit"
                  variant="secondary"
                  icon="search"
                />
                {q ? (
                  <Button label="Tout voir" variant="ghost" href="/dashboard/customers" />
                ) : null}
              </div>
            </div>
            <p className="field__hint">
              La recherche trouve un nom comme un numéro, et n’a pas besoin de
              l’orthographe exacte.
            </p>
          </form>
        </section>

        {/* Said out loud rather than swallowed: one character is not sent, so
            the list below is the whole book and not a result. */}
        {q.length > 0 && !searching ? (
          <Notice tone="warning" title="Recherche trop courte">
            Il faut au moins {MIN_QUERY} caractères. Toute votre clientèle est
            affichée en attendant.
          </Notice>
        ) : null}

        <section className="stack stack-4">
          <SectionHead
            label={searching ? "Résultats" : "Tous vos clients"}
            aside={
              shown > 0
                ? `${shown}${customers.next_cursor ? "+" : ""} personne${shown > 1 ? "s" : ""}`
                : undefined
            }
          />

          {shown === 0 ? (
            searching ? (
              <EmptyState
                compact
                sketch="notebook"
                title="Aucun client ne correspond"
                body="Essayez une autre orthographe, ou les derniers chiffres du numéro."
                action={<Button label="Tout voir" variant="secondary" href="/dashboard/customers" />}
              />
            ) : (
              <EmptyState
                sketch="notebook"
                title="Aucun client pour l’instant"
                body="Dès qu’une personne réserve, son nom et son numéro arrivent ici. Vous n’avez rien à saisir."
              />
            )
          ) : (
            <div className="stack stack-6">
              <ul className="list list--boxed">
                {customers.data.map((customer) => (
                  <li key={customer.customer_id}>
                    <Row customer={customer} zone={zone} q={q} />
                  </li>
                ))}
              </ul>

              {customers.next_cursor ? (
                <div className="row row-3" style={{ justifyContent: "center" }}>
                  <Button
                    label="Voir la suite"
                    variant="secondary"
                    iconEnd="arrow-right"
                    href={nextPage(q, customers.next_cursor)}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * One person, as a line in a book.
 *
 * <p>The visit count is on the row because it is the one thing that separates
 * a regular from a first visit at a glance, which is the question this screen
 * exists to answer. It counts every appointment, cancellations included - a
 * count that hid them would make a serial canceller look new.
 */
function Row({
  customer,
  zone,
  q,
}: {
  customer: CustomerSummary;
  zone: string;
  q: string;
}) {
  return (
    <Link className="list-row" href={detailHref(customer.customer_id, q)}>
      <Avatar name={customer.full_name} size="sm" tone="client" />
      <span className="grow stack stack-1">
        <span className="t-small">{customer.full_name}</span>
        <span className="t-caption t-dim">
          <span className="tnum">{customer.phone}</span>
          {customer.last_visit ? (
            <>
              {" · Dernière visite "}
              {day(customer.last_visit, zone)}
            </>
          ) : null}
        </span>
      </span>
      <Badge
        label={customer.visits > 1 ? `${customer.visits} visites` : `${customer.visits} visite`}
        tone="neutral"
      />
      <Icon name="chevron-right" size={16} />
    </Link>
  );
}

/** The search travels into the card so its back link returns to the result. */
function detailHref(id: string, q: string): string {
  const path = `/dashboard/customers/${encodeURIComponent(id)}`;
  return q ? `${path}?q=${encodeURIComponent(q)}` : path;
}

/** The next page is this search plus the cursor the last one handed back. */
function nextPage(q: string, cursor: string): string {
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  next.set("cursor", cursor);
  return `/dashboard/customers?${next.toString()}`;
}
