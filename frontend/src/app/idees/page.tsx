import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon, Scene, TradeIcon } from "@/components/icon";
import { initials } from "@/components/ui";
import { publicApi } from "@/lib/api";
import { mediaUrl } from "@/lib/format";
import type { CategoryList, ProviderSummary, ProviderSummaryPage } from "@/lib/types";
import { SiteFooter, SiteHeader } from "@/components/site";

/** A selection shows who is registered under it, and that changes daily. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Idées et occasions",
  description:
    "Un mariage, une rentrée, une panne, un véhicule : chaque sélection interroge plusieurs métiers d’un coup.",
};

/**
 * The four selections, written here on purpose.
 *
 * <p>Editorial, not data. There is no collections endpoint and there should
 * not be one: a selection is a sentence about an occasion plus a handful of
 * trade slugs, and the API already publishes the trades. What a table would
 * add is a second place to edit French copy.
 *
 * <p>The slugs are `category_slug` values the directory accepts. One that no
 * longer exists in `GET /v1/categories` is dropped rather than drawn - a chip
 * with no label is a promise the taxonomy has stopped keeping.
 */
export const COLLECTIONS = [
  {
    id: "mariage",
    eyebrow: "Sélection 01",
    title: "Préparer un mariage",
    lead: "Le photographe, le traiteur, la salle, le DJ et la décoration, au même endroit, avec les disponibilités de chacun.",
    scene: "photographer",
    trades: [
      "photographie",
      "traiteur",
      "location-salle",
      "dj-animation",
      "decoration-evenementielle",
      "fleuriste",
      "video",
      "maquillage",
    ],
  },
  {
    id: "rentree",
    eyebrow: "Sélection 02",
    title: "La rentrée",
    lead: "Uniformes cousus sur mesure, cours de soutien et cours de langues avant la reprise.",
    scene: "tailor",
    trades: ["couture", "cours-particuliers", "cours-langues", "formation-professionnelle"],
  },
  {
    id: "panne-maison",
    eyebrow: "Sélection 03",
    title: "Une panne à la maison",
    lead: "Plomberie, climatisation, électricité, énergie solaire : quelqu’un se déplace chez vous.",
    scene: "tools",
    trades: [
      "plomberie",
      "climatisation",
      "electricite",
      "energie-solaire",
      "reparation-telephone",
    ],
  },
  {
    id: "vehicule",
    eyebrow: "Sélection 04",
    title: "Votre véhicule",
    lead: "Révision, lavage, réparation moto ou location : déposez le matin, récupérez le soir.",
    scene: "mechanic",
    trades: ["mecanique-auto", "mecanique-moto", "lavage-auto", "location-vehicule", "auto-ecole"],
  },
] as const;

/** How many of a selection's professionals are shown beside it. */
const SHOWN = 3;

type Category = CategoryList["data"][number];

export default async function Ideas() {
  const [categories, pages] = await Promise.all([
    publicApi<CategoryList>("/v1/categories"),
    Promise.all(
      COLLECTIONS.map((c) =>
        publicApi<ProviderSummaryPage>("/v1/providers", {
          query: { category_slug: [...c.trades], limit: SHOWN },
        }),
      ),
    ),
  ]);

  const known = new Map(categories.data.map((c) => [c.slug, c]));
  const selections = COLLECTIONS.map((c, i) => ({
    ...c,
    trades: c.trades.map((slug) => known.get(slug)).filter((t): t is Category => t !== undefined),
    providers: pages[i]?.data ?? [],
  })).filter((c) => c.trades.length > 0);

  return (
    <>
      <SiteHeader active="idees" />

      <main id="contenu" className="has-tabbar">
        <section
          className="hero atmo grain grain--dark tex-halo tex-halo--dark"
          style={{ paddingBottom: "var(--s-8)" }}
        >
          <div className="page hero__in" style={{ paddingBlock: "var(--s-10) var(--s-12)" }}>
            <nav className="crumbs" aria-label="Fil d’Ariane">
              <Link href="/">Accueil</Link>
              <Icon name="chevron-right" />
              <span aria-current="page">Idées</span>
            </nav>
            <div
              className="feature feature--wide-left"
              style={{ alignItems: "center", marginTop: "var(--s-5)" }}
            >
              <div>
                <p className="hero__eyebrow" data-enter="1">
                  <Icon name="sparkle" size={18} /> Chercher autrement
                </p>
                <h1 className="t-display hero__title" data-enter="2">
                  On ne cherche pas un métier. <em>On cherche à régler quelque chose.</em>
                </h1>
                <p className="hero__sub" data-enter="3">
                  Un mariage, une rentrée, une panne, une voiture à réviser. Chaque sélection
                  interroge plusieurs métiers d’un coup et vous montre qui est disponible.
                </p>
                <div
                  className="row row--wrap"
                  style={{ marginTop: "var(--s-8)", gap: "var(--s-2)" }}
                  data-enter="4"
                >
                  {selections.map((c) => (
                    <a key={c.id} className="suggest__chip" href={`#c-${c.id}`}>
                      {c.title}
                    </a>
                  ))}
                </div>
              </div>
              <div className="feature__art" data-enter="5">
                <div style={{ position: "relative", width: "min(100%,340px)", aspectRatio: "1" }}>
                  {SCENE_LAYERS.map((layer) => (
                    <svg
                      key={layer.name}
                      viewBox="0 0 200 150"
                      aria-hidden="true"
                      style={{ position: "absolute", width: "62%", ...layer.at }}
                    >
                      <use href={`#s-${layer.name}`} />
                    </svg>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {selections.map((c, i) => {
          const sunken = i % 2 === 1;
          return (
            <section
              key={c.id}
              id={`c-${c.id}`}
              className={sunken ? "section section--sunken atmo grain" : "section atmo tex-dots"}
            >
              <Scene name={c.scene} className={sunken ? "wm wm--br" : "wm wm--bl"} />
              <div className="page">
                <div
                  className={sunken ? "feature feature--flip" : "feature"}
                  style={{ alignItems: "start" }}
                >
                  <div data-reveal={sunken ? "right" : "left"}>
                    <p className="t-overline t-overline--accent">{c.eyebrow}</p>
                    <h2 className="t-h1 hair" style={{ marginTop: "var(--s-5)" }}>
                      {c.title}
                    </h2>
                    <p
                      className="t-lead"
                      style={{ marginTop: "var(--s-4)", maxWidth: "46ch" }}
                    >
                      {c.lead}
                    </p>
                    <div
                      className="row row--wrap"
                      style={{ marginTop: "var(--s-6)", gap: "var(--s-2)" }}
                    >
                      {c.trades.map((t) => (
                        <Link
                          key={t.slug}
                          className="chip"
                          href={`/?category_slug=${encodeURIComponent(t.slug)}`}
                        >
                          <TradeIcon slug={t.slug} size={16} /> {t.label_fr}
                          <span className="count count--quiet">{t.provider_count}</span>
                        </Link>
                      ))}
                    </div>
                    <div style={{ marginTop: "var(--s-8)" }}>
                      <Link className="btn btn--primary" href={directory(c.trades)}>
                        <span className="btn__label--idle">Ouvrir la sélection</span>
                        <Icon name="arrow-right" size={18} className="ico--arrow" />
                      </Link>
                    </div>
                  </div>

                  <div data-reveal={sunken ? "left" : "right"}>
                    <p className="t-overline" style={{ marginBottom: "var(--s-4)" }}>
                      Quelques professionnels de la sélection
                    </p>
                    {c.providers.length === 0 ? (
                      <p className="t-sm">
                        Personne n’est encore inscrit sous ces métiers. Ce sera le cas dès la
                        première page publiée.
                      </p>
                    ) : (
                      <div
                        className="stack"
                        style={{ "--stack-gap": "var(--s-3)" } as CSSProperties}
                      >
                        {c.providers.map((p) => (
                          <ProviderRow
                            key={p.slug}
                            provider={p}
                            tradeLabel={
                              p.category_slug ? known.get(p.category_slug)?.label_fr : undefined
                            }
                          />
                        ))}
                      </div>
                    )}
                    <div
                      className="card card--pad-sm"
                      style={{
                        marginTop: "var(--s-3)",
                        background: "transparent",
                        borderStyle: "dashed",
                        boxShadow: "none",
                      }}
                    >
                      <p className="t-xs">
                        <Icon name="info" size={16} /> {c.trades.length} métiers interrogés,{" "}
                        {c.trades.reduce((sum, t) => sum + t.provider_count, 0)} professionnels au
                        total.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}

        <section
          className="section section--dark on-dark atmo grain grain--dark"
          style={{ paddingBlock: "var(--s-12)" }}
        >
          <div className="page">
            <div className="feature" style={{ alignItems: "center" }}>
              <div data-reveal="left">
                <p className="t-overline" style={{ color: "var(--accent)" }}>
                  Pourquoi pas un métier
                </p>
                <h2 className="t-h2" style={{ color: "#fff", marginTop: "var(--s-3)" }}>
                  «&nbsp;Mariage&nbsp;» n’est pas un métier
                </h2>
                <p
                  className="t-lead"
                  style={{ color: "var(--text-on-dark-muted)", marginTop: "var(--s-4)" }}
                >
                  Un photographe couvre un mariage, une réunion d’entreprise et des portraits.
                  L’enfermer dans une catégorie «&nbsp;mariage&nbsp;» le rendrait introuvable le
                  reste de l’année.
                </p>
                <p
                  className="t-body"
                  style={{ color: "var(--text-on-dark-muted)", marginTop: "var(--s-4)" }}
                >
                  Une sélection est donc une recherche sur plusieurs métiers à la fois, pas une
                  case supplémentaire dans le catalogue.
                </p>
              </div>
              <div className="feature__art" data-reveal="right">
                <div
                  className="row row--wrap"
                  style={{ gap: "var(--s-3)", justifyContent: "center", maxWidth: 420 }}
                >
                  {(selections[0]?.trades ?? []).map((t) => (
                    <span key={t.slug} className="suggest__chip">
                      <TradeIcon slug={t.slug} size={18} /> {t.label_fr}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar />
    </>
  );
}

/** The four drawings behind the hero, and where each sits. */
const SCENE_LAYERS = [
  { name: "photographer", at: { color: "rgba(255,255,255,0.13)", top: 0, left: 0 } },
  { name: "tailor", at: { color: "rgba(255,255,255,0.19)", top: "6%", right: 0 } },
  { name: "tools", at: { color: "rgba(255,255,255,0.25)", bottom: "8%", left: "4%" } },
  { name: "mechanic", at: { color: "rgba(255,255,255,0.31)", bottom: 0, right: "6%" } },
] as const;

/** The directory, filtered on every trade of a selection at once. */
function directory(trades: Category[]): string {
  const params = new URLSearchParams();
  for (const t of trades) params.append("category_slug", t.slug);
  return `/?${params.toString()}`;
}

/**
 * A professional, as a selection lists them.
 *
 * <p>No starting price: `ProviderSummary` carries none, and the cheapest
 * service is a figure only the provider's own page can state truthfully.
 */
function ProviderRow({
  provider,
  tradeLabel,
}: {
  provider: ProviderSummary;
  tradeLabel?: string;
}) {
  const logo = mediaUrl(provider.logo_url);
  const place = provider.area ?? provider.locality?.label_fr;
  return (
    <Link
      className="card card--pad-sm card--interactive row"
      href={`/p/${provider.slug}`}
      style={{ textDecoration: "none", color: "inherit", gap: "var(--s-4)" }}
    >
      <span className="avatar">
        {logo ? (
          // Plain img: the bytes come through this server's own /media route,
          // already sized and immutable.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={40} height={40} />
        ) : (
          initials(provider.business_name)
        )}
      </span>
      <span className="grow">
        <span className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
          {provider.business_name}
        </span>
        {tradeLabel || place ? (
          <span className="t-xs" style={{ display: "block", marginTop: 2 }}>
            {[tradeLabel, place].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
    </Link>
  );
}


function TabBar() {
  return (
    <nav className="tabbar" aria-label="Navigation mobile">
      <Link className="tabbar__item" href="/">
        <Icon name="home" />
        <span>Accueil</span>
      </Link>
      <Link className="tabbar__item" href="/metiers">
        <Icon name="grid" />
        <span>Métiers</span>
      </Link>
      <Link className="tabbar__item" href="/">
        <Icon name="search" />
        <span>Rechercher</span>
      </Link>
      <Link className="tabbar__item" href="/bookings">
        <Icon name="calendar-check" />
        <span>Réservation</span>
      </Link>
    </nav>
  );
}
