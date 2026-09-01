import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon, TradeIcon } from "@/components/icon";
import { publicApi } from "@/lib/api";
import type { CategoryList } from "@/lib/types";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

/** A trade holds nobody until somebody registers under it, and then it does. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Les métiers",
  description:
    "Tous les métiers de Balaaca, rangés par famille. Ceux qui comptent déjà un professionnel viennent en premier.",
};

type Category = CategoryList["data"][number];

/**
 * Where a trade the contract left without a family lands.
 *
 * <p>`family` is optional on `CategoryView`, and a trade that belongs to none
 * has to appear somewhere: a bucket at the end is visible, and dropping it is
 * a trade nobody can reach.
 */
const UNGROUPED = { slug: "divers", label_fr: "Divers" };

/**
 * The band behind the closing call, glyph for glyph as the design draws it.
 *
 * <p>Decoration, not data - it is aria-hidden and names no count. Drawing it
 * from the busiest trades instead would put eight identical fallback
 * storefronts on the page the day those trades are ones the sprite has no
 * drawing for.
 */
const BAND = [
  "coiffure",
  "couture",
  "mecanique-auto",
  "traiteur",
  "photographie",
  "plomberie",
  "fleuriste",
  "climatisation",
];

/** French cardinals, because the page spells its count of families out. */
const CARDINALS = [
  "zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit",
  "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
];

type Family = { slug: string; label_fr: string; trades: Category[] };

export default async function Trades() {
  const categories = await publicApi<CategoryList>("/v1/categories");
  const families = groupByFamily(categories.data);
  const total = categories.data.length;

  // The six that hold the most people. A row of zeroes teaches nothing, so
  // when nobody has registered anywhere the row is not drawn at all.
  const leading = categories.data
    .filter((c) => c.provider_count > 0)
    .sort((a, b) => b.provider_count - a.provider_count)
    .slice(0, 6);

  return (
    <>
      <SiteHeader active="metiers" />

      <main id="contenu" className="has-tabbar">
        <section
          className="atmo tex-halo"
          style={{
            paddingBlock: "var(--s-8) var(--s-10)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <svg className="wm wm--tr wm--gold" viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-grid" />
          </svg>
          <div className="page">
            <nav className="crumbs" aria-label="Fil d’Ariane">
              <Link href="/">Accueil</Link>
              <Icon name="chevron-right" />
              <span aria-current="page">Métiers</span>
            </nav>

            <div
              className="feature feature--wide-left"
              style={{ alignItems: "end", marginTop: "var(--s-5)" }}
            >
              <div>
                <h1 className="t-h1" data-enter="1">
                  Les {total} métiers de Balaaca
                </h1>
                <p
                  className="t-lead"
                  style={{ marginTop: "var(--s-3)", maxWidth: "52ch" }}
                  data-enter="2"
                >
                  {upperFirst(familyTally(families.length))}. Les métiers déjà représentés
                  apparaissent en premier&nbsp;; les autres attendent leur premier
                  professionnel.
                </p>
              </div>
              <div data-enter="3">
                <label className="field__label" htmlFor="trade-filter">
                  Filtrer les métiers
                </label>
                <div className="input-group">
                  <span className="input-group__icon">
                    <Icon name="search" size={18} />
                  </span>
                  <input
                    className="input"
                    id="trade-filter"
                    type="search"
                    data-trade-filter=""
                    placeholder="Tresses, vidange, plomberie, cours…"
                    autoComplete="off"
                  />
                </div>
                <p className="field__hint" data-trade-count-label="">
                  {total > 1 ? `${total} métiers affichés.` : `${total} métier affiché.`}
                </p>
              </div>
            </div>

            {leading.length > 0 ? (
              <div
                className="row row--wrap"
                style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}
                data-reveal-group=""
              >
                {leading.map((t) => (
                  <Link
                    key={t.slug}
                    className="chip"
                    href={directory(t.slug)}
                    style={{ padding: "var(--s-3) var(--s-4)" }}
                  >
                    <TradeIcon slug={t.slug} size={18} /> {t.label_fr}{" "}
                    <span className="count count--quiet">{t.provider_count}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section
          className="section atmo tex-dots"
          style={{ paddingBlock: "var(--s-10)" }}
          data-trade-scope=""
        >
          <div className="page">
            <div className="cols cols--aside-main" style={{ gap: "var(--s-10)" }}>
              <aside className="show-lg">
                <div className="sticky-aside">
                  <p className="t-overline" style={{ marginBottom: "var(--s-4)" }}>
                    {families.length === 1
                      ? "La famille"
                      : `Les ${familyTally(families.length)}`}
                  </p>
                  <nav
                    className="stack"
                    style={{ "--stack-gap": "2px" } as CSSProperties}
                    aria-label="Familles de métiers"
                  >
                    {families.map((f) => (
                      <a
                        key={f.slug}
                        className="list__item list__item--link"
                        href={`#family-${f.slug}`}
                        style={{
                          padding: "var(--s-3)",
                          borderRadius: "var(--r-sm)",
                          borderBottom: 0,
                          gap: "var(--s-3)",
                        }}
                      >
                        <span className="choice__icon" style={{ width: 32, height: 32 }}>
                          <FamilyIcon slug={f.slug} small />
                        </span>
                        <span className="grow">
                          <span className="t-sm t-strong">{f.label_fr}</span>
                          <span className="t-xs" style={{ display: "block" }}>
                            {trades(f.trades.length)} · {providers(f.trades)} pros
                          </span>
                        </span>
                      </a>
                    ))}
                  </nav>
                  <div
                    className="card card--pad-sm"
                    style={{
                      marginTop: "var(--s-6)",
                      background: "var(--surface-accent)",
                      borderColor: "var(--border-accent)",
                      boxShadow: "none",
                    }}
                  >
                    <p className="t-xs" style={{ color: "var(--accent-strong)" }}>
                      <Icon name="info" size={16} /> Votre métier manque&nbsp;?
                      Écrivez-nous&nbsp;: la liste évolue avec les professionnels qui
                      s’inscrivent.
                    </p>
                  </div>
                </div>
              </aside>

              <div className="stack" style={{ "--stack-gap": "var(--s-10)" } as CSSProperties}>
                {families.map((f) => (
                  <section key={f.slug} id={`family-${f.slug}`} data-family-block="">
                    <div
                      className="row row--between edge-top"
                      style={{
                        paddingTop: "var(--s-5)",
                        marginBottom: "var(--s-5)",
                        gap: "var(--s-4)",
                        alignItems: "flex-end",
                      }}
                    >
                      <div className="row" style={{ gap: "var(--s-3)" }}>
                        <span className="choice__icon">
                          <FamilyIcon slug={f.slug} />
                        </span>
                        <div>
                          <h2 className="t-h3">{f.label_fr}</h2>
                          <p className="t-xs" style={{ marginTop: 2 }}>
                            {blurb(f.trades)}
                          </p>
                        </div>
                      </div>
                      <span
                        className="t-xs"
                        data-family-count=""
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {trades(f.trades.length)}
                      </span>
                    </div>
                    <div className="trades trades--dense" data-reveal-group="">
                      {f.trades.map((t) => (
                        <Link
                          key={t.slug}
                          className={t.provider_count === 0 ? "trade trade--empty" : "trade"}
                          href={directory(t.slug)}
                          data-trade-name={`${t.label_fr} ${f.label_fr}`.toLowerCase()}
                        >
                          <span className="trade__icon">
                            <TradeIcon slug={t.slug} />
                          </span>
                          <span className="grow">
                            <span className="trade__name">{t.label_fr}</span>
                            <span className="trade__count">{people(t.provider_count)}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}

                <p
                  className="t-sm"
                  data-trade-empty=""
                  hidden
                  style={{ padding: "var(--s-10) 0", textAlign: "center" }}
                >
                  Aucun métier ne correspond. Essayez un autre mot, ou{" "}
                  <Link className="link" href="/metiers">
                    affichez les {total} métiers
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="section section--dark on-dark atmo grain grain--dark tex-halo tex-halo--dark"
          style={{ paddingBlock: "var(--s-12)" }}
        >
          <div
            className="glyph-band glyph-band--dark"
            style={{ top: "50%", transform: "translateY(-50%)" }}
            aria-hidden="true"
          >
            {BAND.map((slug) => (
              <TradeIcon key={slug} slug={slug} />
            ))}
          </div>
          <div
            className="page"
            style={{
              position: "relative",
              display: "grid",
              gap: "var(--s-6)",
              justifyItems: "center",
              textAlign: "center",
            }}
          >
            <h2 className="t-h1" style={{ color: "#fff", maxWidth: "22ch" }}>
              Vous exercez l’un de ces métiers&nbsp;?
            </h2>
            <p className="t-lead" style={{ color: "var(--text-on-dark-muted)", maxWidth: "48ch" }}>
              Créez votre page, ajoutez une prestation, publiez. Vos clients réservent le jour
              même.
            </p>
            <Link className="btn btn--inverse btn--lg" href="/inscription">
              <span className="btn__label--idle">Créer ma page</span>
              <Icon name="arrow-right" size={18} className="ico--arrow" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar active="metiers" />
    </>
  );
}

/**
 * The families in the order the taxonomy publishes them, each one's trades
 * busiest first.
 *
 * <p>Two different orders on purpose, and both are the design's. A family is a
 * heading somebody scans for, so it stays where the server put it; a trade
 * inside one is a destination, and the page's own promise - "les métiers déjà
 * représentés apparaissent en premier" - is that the ones holding somebody
 * come first.
 */
function groupByFamily(categories: Category[]): Family[] {
  const families = new Map<string, Family>();
  for (const c of categories) {
    const slug = c.family?.slug ?? UNGROUPED.slug;
    const family = families.get(slug) ?? {
      slug,
      label_fr: c.family?.label_fr ?? UNGROUPED.label_fr,
      trades: [],
    };
    family.trades.push(c);
    families.set(slug, family);
  }
  for (const f of families.values()) {
    f.trades.sort(
      (a, b) => b.provider_count - a.provider_count || a.label_fr.localeCompare(b.label_fr, "fr"),
    );
  }
  // The bucket last, wherever its first orphan happened to appear.
  return [...families.values()].sort((a, b) =>
    a.slug === UNGROUPED.slug ? 1 : b.slug === UNGROUPED.slug ? -1 : 0,
  );
}

function providers(trades: Category[]): number {
  return trades.reduce((sum, t) => sum + t.provider_count, 0);
}

function trades(count: number): string {
  return count > 1 ? `${count} métiers` : `${count} métier`;
}

function people(count: number): string {
  if (count === 0) return "Aucun professionnel";
  return count > 1 ? `${count} professionnels` : "1 professionnel";
}

/** "huit familles" - the count as this page words it, not as a figure. */
function familyTally(count: number): string {
  return count === 1 ? "une famille" : `${CARDINALS[count] ?? count} familles`;
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * What a family covers, in one line under its name.
 *
 * <p>The design writes an editorial summary there - "Coiffure, barbier,
 * ongles, maquillage". `CategoryFamily` publishes no such sentence, so the
 * line names the trades the family actually holds, busiest first: the same
 * thing said with words the server produced.
 */
function blurb(held: Category[]): string {
  return held
    .slice(0, 4)
    .map((t) => t.label_fr)
    .join(", ");
}

/** The directory, filtered on one trade. */
function directory(slug: string): string {
  return `/?category_slug=${encodeURIComponent(slug)}`;
}

/**
 * A family's own glyph, which lives under `f-` in the sprite - a prefix
 * neither `Icon` nor `TradeIcon` reaches.
 */
function FamilyIcon({ slug, small }: { slug: string; small?: boolean }) {
  if (slug === UNGROUPED.slug) return <Icon name="grid" size={small ? 18 : undefined} />;
  return (
    <svg className={small ? "ico ico--sm" : "ico"} aria-hidden="true" focusable="false">
      <use href={`#f-${slug}`} />
    </svg>
  );
}

