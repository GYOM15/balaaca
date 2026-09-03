import Link from "next/link";
import { Icon, Scene } from "@/components/icon";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";
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
  // The API pages rather than counts, so a full page with a cursor behind it is
  // "thirty and more" and never "thirty".
  const more = customers.next_cursor ? "+" : "";
  // The book itself is empty, which is not the same as a page or a search that
  // came back with nothing.
  const book = shown === 0 && !searching && !query.cursor;
  const many = shown > 1;

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
            <h1 className="appbar__title">Clientèle</h1>
            <div className="appbar__sub">
              {book
                ? "Aucun client pour l’instant"
                : searching
                  ? `${shown}${more} résultat${many ? "s" : ""}`
                  : `${shown}${more} personne${many ? "s" : ""} ${many ? "ont" : "a"} déjà réservé`}
            </div>
          </div>
          <div className="appbar__actions" />
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {book ? (
            <div className="empty">
              <Scene name="notebook" className="scene-ill" />
              <div className="empty__title">Vos premiers clients apparaîtront ici</div>
              <p className="empty__body">
                Dès qu’une personne réserve, sa fiche est créée automatiquement :
                historique des rendez-vous et note privée que vous seul voyez.
              </p>
              <div className="empty__actions">
                <Link className="btn btn--primary" href="/dashboard/profile">
                  <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                    <Icon name="share" size={18} />
                  </span>
                  <span className="btn__label--idle">Partager ma page</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* The cursor is deliberately absent from this form. A new search
                  starts at the first page; carrying the old cursor would open it
                  in the middle of a result set it does not belong to. */}
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
                    type="search"
                    name="q"
                    defaultValue={q}
                    // The design has no room for "recherche trop courte", so the
                    // field refuses the submission instead of the page
                    // explaining it afterwards.
                    minLength={MIN_QUERY}
                    maxLength={MAX_QUERY}
                    placeholder="Nom ou numéro de téléphone"
                    aria-label="Rechercher un client"
                  />
                </div>
              </form>

              {shown === 0 ? (
                <div className="empty">
                  <Scene name="notebook" className="scene-ill" />
                  <div className="empty__title">Aucun client ne correspond</div>
                  <p className="empty__body">
                    Essayez une autre orthographe, ou les derniers chiffres du numéro.
                  </p>
                  <div className="empty__actions">
                    <Link className="btn btn--secondary" href="/dashboard/customers">
                      <span className="btn__label--idle">Tout voir</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="panel">
                    <div className="list" style={{ borderTop: 0 }}>
                      {customers.data.map((customer) => (
                        <Row key={customer.customer_id} customer={customer} zone={zone} />
                      ))}
                    </div>
                  </div>

                  {customers.next_cursor ? (
                    <div className="pager">
                      <Link
                        className="btn btn--secondary"
                        href={nextPage(q, customers.next_cursor)}
                      >
                        <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                          <Icon name="chevron-down" size={18} />
                        </span>
                        <span className="btn__label--idle">Charger la suite</span>
                      </Link>
                    </div>
                  ) : null}
                </>
              )}
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
function Row({ customer, zone }: { customer: CustomerSummary; zone: string }) {
  return (
    <Link
      className="list__item list__item--link"
      href={`/dashboard/customers/${encodeURIComponent(customer.customer_id)}`}
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
          {customer.last_visit ? ` · dernier le ${longDay(customer.last_visit, zone)}` : ""}
        </div>
      </div>
      <Icon name="chevron-right" size={18} />
    </Link>
  );
}

/**
 * A date without its weekday, which is how the design writes one inside a line
 * of running text. `format.ts` only has the long form, and "dernier le mercredi
 * 2 septembre 2026" is a mouthful in the middle of a sentence.
 */
function longDay(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr", { dateStyle: "long", timeZone }).format(
    new Date(instant),
  );
}

/** The next page is this search plus the cursor the last one handed back. */
function nextPage(q: string, cursor: string): string {
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  next.set("cursor", cursor);
  return `/dashboard/customers?${next.toString()}`;
}
