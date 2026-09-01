import Link from "next/link";
import { Icon } from "@/components/icon";
import { ActionButton, Avatar, Button, EmptyState, Notice } from "@/components/ui";
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
  const more = customers.next_cursor ? "+" : "";

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <div>
            <h1 className="appbar__title">Clientèle</h1>
            <div className="appbar__sub">
              {shown === 0
                ? searching
                  ? "Aucun résultat"
                  : "Aucun client pour l'instant"
                : searching
                  ? `${shown}${more} résultat${shown > 1 ? "s" : ""}`
                  : `${shown}${more} personne${shown > 1 ? "s" : ""} ont déjà réservé`}
            </div>
          </div>
        </div>
      </div>

      <main className="app__main has-tabbar" id="contenu">
        <div className="app__inner">
          {/* The cursor is deliberately absent from this form. A new search
              starts at the first page; carrying the old cursor would open it in
              the middle of a result set it does not belong to. */}
          <form
            className="toolbar"
            style={{ marginBottom: "var(--s-5)" }}
            method="get"
            action="/dashboard/customers"
          >
            <div className="input-group" style={{ maxWidth: "360px", flex: 1 }}>
              <span className="input-group__icon">
                <Icon name="search" size={18} />
              </span>
              <input
                className="input"
                id="customer-q"
                type="search"
                name="q"
                defaultValue={q}
                maxLength={MAX_QUERY}
                autoComplete="off"
                placeholder="Nom ou numéro de téléphone"
                aria-label="Rechercher un client"
              />
            </div>
            <ActionButton label="Rechercher" type="submit" variant="secondary" icon="search" />
            {q ? <Button label="Tout voir" variant="ghost" href="/dashboard/customers" /> : null}
          </form>

          {/* Said out loud rather than swallowed: one character is not sent, so
              the list below is the whole book and not a result. */}
          {q.length > 0 && !searching ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="warning" title="Recherche trop courte">
                Il faut au moins {MIN_QUERY} caractères. Toute votre clientèle est
                affichée en attendant.
              </Notice>
            </div>
          ) : null}

          {shown === 0 ? (
            searching ? (
              <EmptyState
                compact
                sketch="notebook"
                title="Aucun client ne correspond"
                body="Essayez une autre orthographe, ou les derniers chiffres du numéro."
                action={
                  <Button label="Tout voir" variant="secondary" href="/dashboard/customers" />
                }
              />
            ) : (
              <EmptyState
                sketch="notebook"
                title="Vos premiers clients apparaîtront ici"
                body="Dès qu’une personne réserve, sa fiche est créée toute seule : historique des rendez-vous et note privée que vous seul voyez."
                action={
                  <Button
                    label="Partager ma page"
                    variant="primary"
                    icon="share"
                    href="/dashboard/profile"
                  />
                }
              />
            )
          ) : (
            <>
              <div className="panel">
                <div className="list" style={{ borderTop: 0 }}>
                  {customers.data.map((customer) => (
                    <Row key={customer.customer_id} customer={customer} zone={zone} q={q} />
                  ))}
                </div>
              </div>

              {customers.next_cursor ? (
                <div className="pager">
                  <Button
                    label="Charger la suite"
                    variant="secondary"
                    icon="chevron-down"
                    href={nextPage(q, customers.next_cursor)}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>
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
    <Link
      className="list__item list__item--link"
      href={detailHref(customer.customer_id, q)}
    >
      <Avatar name={customer.full_name} />
      <div className="grow">
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <span className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
            {customer.full_name}
          </span>
        </div>
        <div className="t-xs" style={{ marginTop: "2px" }}>
          {customer.phone} · {customer.visits} rendez-vous
          {customer.last_visit ? ` · dernier le ${day(customer.last_visit, zone)}` : ""}
        </div>
      </div>
      <Icon name="chevron-right" size={18} />
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
