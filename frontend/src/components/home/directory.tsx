import Link from "next/link";
import { Icon, Scene } from "@/components/icon";
import { Button } from "@/components/ui";
import type { AreaList, LocalityList, ProviderSummaryPage } from "@/lib/types";
import { Filters } from "./filters";
import { ProviderTile } from "./provider-tile";
import { directoryHref, type Asked } from "./query";
import type { Trade } from "./taxonomy";

/**
 * The directory, once something has been asked for.
 *
 * <p>The same route as the hub. A search is a state of the home page and not a
 * second address, which is why the form above posts here and why "Tout
 * effacer" is a link back to `/`.
 */
export function Directory({
  asked,
  heading,
  place,
  localityName,
  results,
  labels,
  shortlist,
  total,
  localities,
  areas,
}: {
  asked: Asked;
  heading: string;
  /** The place asked for, written as a reader would say it. */
  place: string | undefined;
  /** The commune or prefecture asked for, by its published label. */
  localityName: string | undefined;
  results: ProviderSummaryPage;
  labels: Map<string, string>;
  shortlist: Trade[];
  total: number;
  localities: LocalityList;
  areas: AreaList;
}) {
  const empty = results.data.length === 0;
  const chips = [
    ...asked.selected.map((slug) => ({
      key: `t-${slug}`,
      label: labels.get(slug) ?? slug,
      href: directoryHref({ ...asked, selected: asked.selected.filter((s) => s !== slug) }),
    })),
    ...(asked.locality
      ? [
          {
            key: "locality",
            label: localityName ?? asked.locality,
            href: directoryHref({ ...asked, locality: "" }),
          },
        ]
      : []),
    ...(asked.area
      ? [{ key: "area", label: asked.area, href: directoryHref({ ...asked, area: "" }) }]
      : []),
  ];

  return (
    <>
      <section
        className="atmo tex-halo"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="page" style={{ paddingBlock: "var(--s-6)" }}>
          <nav className="crumbs" aria-label="Fil d’Ariane">
            <Link href="/">Accueil</Link>
            <Icon name="chevron-right" />
            <span aria-current="page">Recherche</span>
          </nav>
          <h1 className="t-h2" style={{ marginTop: "var(--s-3)" }} data-enter="1">
            {heading}
          </h1>
          <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
            {empty
              ? "Aucun professionnel ne correspond encore à cette combinaison."
              : "Classés par ordre alphabétique : aucun classement payant, aucune mise en avant."}
          </p>
          {chips.length > 0 ? (
            <div className="row row--wrap" style={{ marginTop: "var(--s-4)" }}>
              {chips.map((c) => (
                // The cross drops this one filter and keeps the others, which is
                // what a cross on a chip means everywhere else.
                <Link key={c.key} className="chip is-active" href={c.href}>
                  {c.label}
                  <span className="chip__remove">
                    <Icon name="x" size={16} />
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="section atmo tex-dots" style={{ paddingBlock: "var(--s-8)" }}>
        <div className="page">
          <div className="cols cols--aside-main">
            <aside>
              {/* Two copies of one form, as the mockup has it: the filters fold
                  away on a telephone and stay open on a desk, and CSS cannot
                  move a node between two places. */}
              <details className="hide-lg" style={{ marginBottom: "var(--s-4)" }}>
                <summary className="btn btn--secondary btn--block">
                  <Icon name="sliders" size={18} /> Filtrer et trier
                </summary>
                <div style={{ marginTop: "var(--s-4)" }}>
                  <Filters
                    variant="m"
                    q={asked.q}
                    selected={asked.selected}
                    locality={asked.locality}
                    area={asked.area}
                    trades={shortlist}
                    total={total}
                    localities={localities}
                    areas={areas}
                  />
                </div>
              </details>
              <div className="show-lg sticky-aside">
                <Filters
                  variant="d"
                  q={asked.q}
                  selected={asked.selected}
                  locality={asked.locality}
                  area={asked.area}
                  trades={shortlist}
                  total={total}
                  localities={localities}
                  areas={areas}
                />
              </div>
            </aside>

            <div>
              <div className="toolbar" style={{ marginBottom: "var(--s-6)" }}>
                <p className="t-sm">
                  <strong className="t-strong">{results.data.length}</strong>{" "}
                  {results.data.length > 1 ? "professionnels" : "professionnel"}
                  {/* The contract publishes no total, only the page and the
                      cursor after it, so the figure says what it counts. */}
                  {results.next_cursor ? " sur cette page" : ""}
                </p>
                <span className="toolbar__spacer" />
                <span className="t-xs">Classement alphabétique</span>
              </div>

              {empty ? (
                <div className="empty">
                  <Scene name="storefront" className="scene-ill" />
                  <div className="empty__title">
                    Personne
                    {asked.selected.length > 0 ? " dans ce métier" : ""}
                    {place ? ` à ${place}` : ""} pour l’instant
                  </div>
                  <p className="empty__body">
                    {asked.selected.length > 0
                      ? `Ce métier existe sur Balaaca, mais aucun professionnel ne s’y est encore inscrit${place ? ` à ${place}` : ""}. Élargissez la zone, ou changez de métier.`
                      : "Élargissez la zone, ou changez de métier."}
                  </p>
                  <div className="empty__actions">
                    <Button label="Chercher partout en Guinée" variant="primary" href="/" />
                    <Button label="Voir les autres métiers" variant="secondary" href="/metiers" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="pcards" data-reveal-group>
                    {results.data.map((p) => (
                      <ProviderTile
                        key={p.slug}
                        provider={p}
                        tradeLabel={p.category_slug ? labels.get(p.category_slug) : undefined}
                      />
                    ))}
                  </div>
                  {results.next_cursor ? (
                    <div className="pager">
                      {/* A link and not the mockup's dead button: the next page
                          is an address, so it is reachable without JavaScript
                          and the back button returns to this one. */}
                      <Link
                        className="btn btn--secondary"
                        href={directoryHref(asked, results.next_cursor)}
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
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
