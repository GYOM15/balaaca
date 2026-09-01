import Link from "next/link";
import type { CSSProperties } from "react";
import { publicApi } from "@/lib/api";
import { Icon, Scene, TradeIcon } from "@/components/icon";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ActionButton, Button } from "@/components/ui";
import { mediaUrl } from "@/lib/format";
import { groupLocalities, localityLabel } from "@/lib/localities";
import type {
  AreaList,
  AreaView,
  CategoryList,
  LocalityList,
  ProviderSummary,
  ProviderSummaryPage,
} from "@/lib/types";

/** The directory changes when a provider publishes. A stale hub hides a new business. */
export const dynamic = "force-dynamic";

/** No alias for a single trade in lib/types.ts, and that file belongs to nobody here. */
type Category = CategoryList["data"][number];

/**
 * The three ways a service is delivered, as `Fulfilment` names them.
 *
 * <p>Copy, not data: the enum is closed in the contract and these three are the
 * whole of it, so a section explaining them cannot go stale without the
 * contract going with it.
 */
const FULFILMENTS = [
  {
    icon: "mode-onsite",
    title: "Sur place",
    body: "Vous vous rendez chez le prestataire et la prestation est réalisée pendant que vous attendez.",
  },
  {
    icon: "mode-dropoff",
    title: "Dépôt",
    body: "Vous déposez l’article, vous repassez le récupérer une fois le travail terminé.",
  },
  {
    icon: "mode-atcustomer",
    title: "À domicile",
    body: "Le prestataire se déplace jusqu’à l’adresse que vous indiquez.",
  },
];

const STEPS = [
  {
    title: "Vous choisissez la prestation",
    body: "Chaque prestation affiche son prix, sa durée et la façon dont elle se passe : sur place, en dépôt, ou chez vous.",
  },
  {
    title: "Vous prenez un créneau libre",
    body: "Seuls les horaires réellement disponibles sont proposés. Vous choisissez la personne si le salon en compte plusieurs.",
  },
  {
    title: "Vous gardez une référence",
    body: "Huit caractères, faciles à dicter au téléphone. Elle vous permet de déplacer ou d’annuler votre rendez-vous.",
  },
];

type Search = {
  q?: string;
  category_slug?: string | string[];
  locality?: string;
  area?: string;
  /**
   * The opaque cursor of the page being asked for. It was missing, and
   * `nextPage` has always minted one - so "Charger la suite" built a correct
   * link, the page ignored it, and the reader got page one again, for ever.
   */
  cursor?: string;
};

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const selected = toList(params.category_slug);
  const locality = params.locality?.trim() ?? "";
  const area = params.area?.trim() ?? "";

  const [categories, localities, areas, results] = await Promise.all([
    publicApi<CategoryList>("/v1/categories"),
    publicApi<LocalityList>("/v1/localities"),
    // Les quartiers déjà écrits, restreints à la localité choisie : proposer
    // ceux de tout le pays quand on cherche à Ratoma serait illisible.
    publicApi<AreaList>("/v1/areas", {
      query: { locality: locality || undefined },
    }),
    publicApi<ProviderSummaryPage>("/v1/providers", {
      query: {
        // Below two characters the API refuses, and rightly: one letter matches
        // most of the directory and answers nothing.
        q: q.length >= 2 ? q : undefined,
        category_slug: selected.length > 0 ? selected : undefined,
        locality: locality || undefined,
        area: area || undefined,
        cursor: params.cursor || undefined,
        limit: 24,
      },
    }),
  ]);

  const labels = new Map(categories.data.map((c) => [c.slug, c.label_fr]));
  const asked =
    q.length >= 2 || selected.length > 0 || locality.length > 0 || area.length > 0;
  const shown = results.data.slice(0, 9);

  // Ranked by how many providers actually hold the trade, which is the only
  // ordering the contract publishes anything for. Alphabetical on a tie.
  const trades = [...categories.data].sort(
    (a, b) => b.provider_count - a.provider_count || a.label_fr.localeCompare(b.label_fr, "fr"),
  );
  const places = [...areas.data]
    .sort((a, b) => b.provider_count - a.provider_count || a.label.localeCompare(b.label, "fr"))
    .slice(0, 8);
  const busiest = trades.filter((t) => t.provider_count > 0).slice(0, 5);
  const settlements = localities.data.filter((l) => l.kind !== "REGION").length;

  const placeAsked = area || localities.data.find((l) => l.slug === locality)?.label_fr;

  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        {asked ? (
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
                  {heading(q, selected, labels, placeAsked)}
                </h1>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Classés par ordre alphabétique&nbsp;: aucun classement payant, aucune
                  mise en avant.
                </p>
              </div>
            </section>

            <section className="section atmo tex-dots" style={{ paddingBlock: "var(--s-8)" }}>
              <div className="page">
                <div className="cols cols--aside-main">
                  <aside>
                    {/* Two copies of one form, as the mockup has it: the filters
                        fold away on a telephone and stay open on a desk, and CSS
                        cannot move a node between two places. */}
                    <details className="hide-lg" style={{ marginBottom: "var(--s-4)" }}>
                      <summary className="btn btn--secondary btn--block">
                        <Icon name="sliders" size={18} /> Filtrer et trier
                      </summary>
                      <div style={{ marginTop: "var(--s-4)" }}>
                        <Filters
                          variant="m"
                          q={q}
                          selected={selected}
                          locality={locality}
                          area={area}
                          trades={trades}
                          localities={localities}
                          areas={areas}
                        />
                      </div>
                    </details>
                    <div className="show-lg sticky-aside">
                      <Filters
                        variant="d"
                        q={q}
                        selected={selected}
                        locality={locality}
                        area={area}
                        trades={trades}
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
                        {results.next_cursor ? " sur cette page" : ""}
                      </p>
                      <span className="toolbar__spacer" />
                      <span className="t-xs">Classement alphabétique</span>
                    </div>

                    {results.data.length === 0 ? (
                      <div className="empty">
                        <Scene name="storefront" className="scene-ill" />
                        <div className="empty__title">Rien ne correspond</div>
                        <p className="empty__body">
                          Essayez un autre mot, une autre commune, ou repartez de la liste
                          des métiers.
                        </p>
                        <div className="empty__actions">
                          <Button label="Effacer la recherche" variant="primary" href="/" />
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
                            <Button
                              label="Charger la suite"
                              variant="secondary"
                              icon="chevron-down"
                              href={nextPage(params, results.next_cursor)}
                            />
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="hero atmo grain grain--dark tex-halo tex-halo--dark">
              <div className="page hero__in">
                <p className="hero__eyebrow" data-enter="1">
                  <Icon name="pin" size={18} /> Conakry et l’intérieur du pays
                </p>
                <h1 className="t-display hero__title" data-enter="2">
                  Le bon professionnel, <em>à l’heure qui vous arrange.</em>
                </h1>
                <p className="hero__sub" data-enter="3">
                  Coiffure, mécanique, couture, traiteur, plomberie&nbsp;: voyez ce qu’il
                  fait, ce que ça coûte, et réservez. Sans créer de compte.
                </p>

                <div data-enter="4">
                  {/* GET, so a search is a URL: it can be shared, bookmarked, and the
                      back button returns to the results rather than to an empty box. */}
                  <form
                    className="search"
                    action="/"
                    method="get"
                    role="search"
                    aria-label="Rechercher un professionnel"
                  >
                    <div className="search__row">
                      <div className="search__cell">
                        <label className="search__label" htmlFor="hero-q">
                          Que cherchez-vous
                        </label>
                        <input
                          className="search__control"
                          id="hero-q"
                          name="q"
                          type="search"
                          autoComplete="off"
                          placeholder="Tresses, vidange, robe sur mesure…"
                          defaultValue={q}
                        />
                      </div>
                      <div className="search__cell">
                        <label className="search__label" htmlFor="hero-locality">
                          Où
                        </label>
                        <select
                          className="search__control"
                          id="hero-locality"
                          name="locality"
                          defaultValue={locality}
                        >
                          <LocalityOptions localities={localities} />
                        </select>
                      </div>
                      <div className="search__cell">
                        <label className="search__label" htmlFor="hero-area">
                          Quartier
                        </label>
                        <input
                          className="search__control"
                          id="hero-area"
                          name="area"
                          list="hero-areas"
                          autoComplete="off"
                          placeholder="Nongo, Kipé, Coléah…"
                          defaultValue={area}
                        />
                        <AreaOptions id="hero-areas" areas={areas} />
                      </div>
                      <div className="search__submit">
                        <ActionButton
                          label="Rechercher"
                          type="submit"
                          icon="search"
                          size="lg"
                          block
                        />
                      </div>
                    </div>
                  </form>
                </div>

                {busiest.length > 0 ? (
                  <div className="suggest" data-enter="5">
                    <span className="suggest__label">Les métiers les plus représentés&nbsp;:</span>
                    {busiest.map((t) => (
                      <Link
                        key={t.slug}
                        className="suggest__chip"
                        href={`/?category_slug=${encodeURIComponent(t.slug)}`}
                      >
                        <TradeIcon slug={t.slug} size={18} /> {t.label_fr}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <Scene name="storefront" className="hero__deco" />
            </section>

            <section
              className="section section--surface atmo tex-dots"
              style={{ paddingBlock: "var(--s-8) var(--s-12)" }}
              aria-labelledby="hub-modes"
            >
              <div className="page">
                <div className="cols cols--2" style={{ gap: "var(--s-6)" }}>
                  <div>
                    <p className="t-overline t-overline--accent">Ce qui change tout</p>
                    <h2
                      className="t-h3"
                      id="hub-modes"
                      style={{ marginTop: "var(--s-2)", maxWidth: "22ch" }}
                    >
                      Sur chaque prestation, vous savez comment ça se passe.
                    </h2>
                  </div>
                  <div className="stack" style={stackGap("var(--s-3)")} data-reveal-group>
                    {FULFILMENTS.map((f) => (
                      <div
                        key={f.icon}
                        className="row"
                        style={{ alignItems: "flex-start", gap: "var(--s-4)" }}
                      >
                        <span className="choice__icon">
                          <Icon name={f.icon} />
                        </span>
                        <div>
                          <div className="t-strong">{f.title}</div>
                          <p className="t-sm" style={{ marginTop: 2 }}>
                            {f.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="section atmo" aria-labelledby="hub-trades">
              <svg className="wm wm--tr" viewBox="0 0 24 24" aria-hidden="true">
                <use href="#i-grid" />
              </svg>
              <div className="page">
                <div className="section-head">
                  <div className="section-head__text">
                    <p className="t-overline">Par métier</p>
                    <h2 className="t-h2" id="hub-trades">
                      Là où il y a déjà du monde
                    </h2>
                    <p className="t-body">
                      Le compte est celui des professionnels déjà inscrits. Les métiers en
                      pointillé attendent le leur.
                    </p>
                  </div>
                  <span className="t-xs t-num">{categories.data.length} métiers</span>
                </div>
                <div className="trades" data-reveal-group>
                  {trades.map((t) => (
                    <Link
                      key={t.slug}
                      className={t.provider_count === 0 ? "trade trade--empty" : "trade"}
                      href={`/?category_slug=${encodeURIComponent(t.slug)}`}
                    >
                      <span className="trade__icon">
                        <TradeIcon slug={t.slug} />
                      </span>
                      <span className="grow">
                        <span className="trade__name">{t.label_fr}</span>
                        <span className="trade__count">
                          {t.provider_count === 0
                            ? "Personne pour l’instant"
                            : `${t.provider_count} professionnel${t.provider_count > 1 ? "s" : ""}`}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            <section className="section section--sunken atmo grain" aria-labelledby="hub-prov">
              <Scene name="storefront" className="wm wm--bl" />
              <div className="page">
                <div className="section-head">
                  <div className="section-head__text">
                    <p className="t-overline">L’annuaire</p>
                    <h2 className="t-h2" id="hub-prov">
                      Des professionnels qui prennent des rendez-vous cette semaine
                    </h2>
                  </div>
                </div>

                {results.data.length === 0 ? (
                  <div className="empty">
                    <Scene name="storefront" className="scene-ill" />
                    <div className="empty__title">L’annuaire ouvre bientôt</div>
                    <p className="empty__body">
                      Aucun professionnel n’est encore inscrit. Les métiers ci-dessus vous
                      diront lesquels arrivent en premier.
                    </p>
                    <div className="empty__actions">
                      <Button
                        label="Inscrire mon activité"
                        variant="primary"
                        href="/inscription"
                        iconEnd="arrow-right"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pcards" data-reveal-group>
                    {shown.map((p) => (
                      <ProviderTile
                        key={p.slug}
                        provider={p}
                        tradeLabel={p.category_slug ? labels.get(p.category_slug) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {places.length > 0 ? (
              <section className="section atmo" aria-labelledby="hub-places">
                <svg className="wm wm--br" viewBox="0 0 24 24" aria-hidden="true">
                  <use href="#i-pin" />
                </svg>
                <div className="page">
                  <div className="section-head">
                    <div className="section-head__text">
                      <p className="t-overline">Par lieu</p>
                      <h2 className="t-h2" id="hub-places">
                        Chercher près de chez soi
                      </h2>
                      <p className="t-body">
                        Les quartiers écrits par les professionnels eux-mêmes, ceux où ils
                        sont déjà les plus nombreux.
                      </p>
                    </div>
                  </div>
                  <div className="trades" data-reveal-group>
                    {places.map((a) => (
                      <Link
                        key={a.label}
                        className="trade"
                        href={`/?area=${encodeURIComponent(a.label)}`}
                      >
                        <span className="trade__icon">
                          <Icon name="pin" />
                        </span>
                        <span className="grow">
                          <span className="trade__name">{a.label}</span>
                          <span className="trade__count">
                            {a.provider_count} professionnel{a.provider_count > 1 ? "s" : ""}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            <section
              className="section section--surface atmo tex-dots"
              aria-labelledby="hub-howto"
            >
              <div className="page">
                <div className="section-head">
                  <div className="section-head__text">
                    <p className="t-overline">Réserver</p>
                    <h2 className="t-h2" id="hub-howto">
                      Trois écrans, pas de compte
                    </h2>
                  </div>
                </div>
                <div className="howto" data-reveal-group>
                  {STEPS.map((s) => (
                    <div className="howto__item" key={s.title}>
                      <h3 className="howto__title">{s.title}</h3>
                      <p className="t-body">{s.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section
              className="section section--dark on-dark atmo grain grain--dark tex-halo tex-halo--dark"
              aria-labelledby="hub-pro"
            >
              <div className="page">
                <div
                  className="cols cols--2"
                  style={{ alignItems: "center", gap: "var(--s-10)" }}
                  data-reveal-group
                >
                  <div>
                    <p className="t-overline" style={{ color: "var(--accent)" }}>
                      Vous exercez un métier
                    </p>
                    <h2
                      className="t-h1"
                      id="hub-pro"
                      style={{ color: "#fff", marginTop: "var(--s-3)" }}
                    >
                      Votre page, votre agenda, votre QR code.
                    </h2>
                    <p
                      className="t-lead"
                      style={{
                        color: "var(--text-on-dark-muted)",
                        marginTop: "var(--s-4)",
                      }}
                    >
                      Vos clients réservent depuis WhatsApp ou depuis l’affiche collée sur
                      votre porte. Vous voyez la journée d’un coup d’œil, vous confirmez, et
                      vous travaillez.
                    </p>
                    <div className="row row--wrap" style={{ marginTop: "var(--s-7)" }}>
                      <Link className="btn btn--inverse btn--lg" href="/inscription">
                        <span>Créer ma page</span>
                      </Link>
                      <Link className="btn btn--ghost btn--lg on-dark" href="/professionnels">
                        <span>Comment ça fonctionne</span>
                      </Link>
                    </div>
                  </div>
                  <div className="facts-band" style={{ gap: "var(--s-8)" }} data-reveal-group>
                    <Fact number={String(categories.data.length)} label="métiers couverts" />
                    <Fact number={String(settlements)} label="communes et préfectures" />
                    <Fact number="0" label="compte à créer pour vos clients" />
                    <Fact number="3G" label="pensé pour les connexions lentes" />
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

/* --- Pieces --------------------------------------------------------------- */

/**
 * A provider, as the directory shows them.
 *
 * <p>The cover band carries the logo, because that is the only image
 * `ProviderSummary` publishes - there is no `cover_url` on it, only on the
 * provider's own page. An empty band is what a business without a logo gets,
 * and it keeps every card the same shape.
 *
 * <p>The trade is shown by its label, resolved by the caller from
 * `GET /v1/categories`. The card carries the slug, and `dj-animation` is not
 * something to print at a customer.
 */
function ProviderTile({
  provider,
  tradeLabel,
}: {
  provider: ProviderSummary;
  tradeLabel?: string;
}) {
  const logo = mediaUrl(provider.logo_url);
  // `city` is the deprecated field the earliest rows carry, and nothing else.
  const place =
    [provider.area, provider.locality?.label_fr].filter(Boolean).join(", ") || provider.city;
  return (
    <Link className="pcard" href={`/p/${provider.slug}`}>
      <span className="pcard__cover">
        {logo ? (
          // Plain img, not next/image: the bytes come through this server's own
          // /media route and are already immutable and sized by the API.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" loading="lazy" width={640} height={360} />
        ) : null}
      </span>
      <span className="pcard__body">
        {tradeLabel ? <span className="pcard__trade">{tradeLabel}</span> : null}
        <span className="pcard__name">{provider.business_name}</span>
        {place ? (
          <span className="t-meta">
            <span>
              <Icon name="pin" size={16} />
              {place}
            </span>
          </span>
        ) : null}
        {provider.description ? (
          <span className="t-sm t-clamp-2" style={{ marginTop: ".25rem" }}>
            {provider.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function Filters({
  variant,
  q,
  selected,
  locality,
  area,
  trades,
  localities,
  areas,
}: {
  variant: "m" | "d";
  q: string;
  selected: string[];
  locality: string;
  area: string;
  trades: Category[];
  localities: LocalityList;
  areas: AreaList;
}) {
  const id = (field: string) => `f-${variant}-${field}`;
  return (
    <form className="stack" action="/" method="get" style={stackGap("var(--s-6)")}>
      <div className="field">
        <label className="field__label" htmlFor={id("q")}>
          Mot-clé
        </label>
        <div className="input-group">
          <span className="input-group__icon">
            <Icon name="search" size={18} />
          </span>
          <input
            className="input"
            id={id("q")}
            name="q"
            type="search"
            autoComplete="off"
            placeholder="Tresses, vidange…"
            defaultValue={q}
          />
        </div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label" style={{ padding: 0 }}>
          Métier
        </legend>
        <p className="t-xs" style={{ margin: "-.25rem 0 .75rem" }}>
          Plusieurs choix possibles.
        </p>
        <div
          className="stack"
          style={{
            ...stackGap("var(--s-3)"),
            maxHeight: 260,
            overflow: "auto",
            paddingRight: "var(--s-2)",
          }}
        >
          {trades.map((t) => (
            <label className="check" key={t.slug}>
              <input
                type="checkbox"
                name="category_slug"
                value={t.slug}
                defaultChecked={selected.includes(t.slug)}
              />
              <span className="check__box">
                <Icon name="check" />
              </span>
              <span className="check__text grow">
                <strong>{t.label_fr}</strong>
              </span>
              <span className="t-xs">{t.provider_count}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor={id("locality")}>
          Commune ou préfecture
        </label>
        <select className="select" id={id("locality")} name="locality" defaultValue={locality}>
          <LocalityOptions localities={localities} />
        </select>
        <p className="field__hint">
          Choisir une région retient aussi tout ce qui est classé dessous.
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={id("area")}>
          Quartier <span className="field__optional">facultatif</span>
        </label>
        <input
          className="input"
          id={id("area")}
          name="area"
          list={id("areas")}
          autoComplete="off"
          placeholder="Nongo, Kipé, Coléah…"
          defaultValue={area}
        />
        <AreaOptions id={id("areas")} areas={areas} />
        <p className="field__hint">
          Saisie libre&nbsp;: les quartiers ne sont pas une liste fermée.
        </p>
      </div>

      <ActionButton label="Appliquer les filtres" type="submit" block />
      <Link
        className="link link--quiet"
        href="/"
        style={{ fontSize: "var(--fs-xs)", textAlign: "center" }}
      >
        Tout effacer
      </Link>
    </form>
  );
}

/** The published map, grouped the way `groupLocalities` shapes it. */
function LocalityOptions({ localities }: { localities: LocalityList }) {
  return (
    <>
      <option value="">Partout en Guinée</option>
      {groupLocalities(localities.data).map(({ region, children }) => (
        <optgroup key={region.slug} label={region.label_fr}>
          {children.map((l) => (
            <option key={l.slug} value={l.slug}>
              {localityLabel(l)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/**
 * Un datalist et pas un select : le quartier est du texte libre côté serveur,
 * parce que les quartiers de Guinée se comptent par milliers et que la
 * plateforme ne les écrit pas. On propose ce qui existe déjà sans interdire le
 * reste - ce qui est exactement ce que fait le serveur.
 */
function AreaOptions({ id, areas }: { id: string; areas: AreaList }) {
  return (
    <datalist id={id}>
      {areas.data.map((a: AreaView) => (
        <option key={a.label} value={a.label} />
      ))}
    </datalist>
  );
}

function Fact({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="factbig__num" style={{ color: "var(--accent)" }}>
        {number}
      </div>
      <div className="factbig__lbl" style={{ color: "var(--text-on-dark-muted)" }}>
        {label}
      </div>
    </div>
  );
}

/* --- Plumbing ------------------------------------------------------------- */

/** The contract repeats the parameter rather than joining it. */
function toList(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** The next page is this query plus the cursor the last one handed back. */
function nextPage(params: Search, cursor: string): string {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (params.locality) next.set("locality", params.locality);
  if (params.area) next.set("area", params.area);
  for (const slug of toList(params.category_slug)) next.append("category_slug", slug);
  next.set("cursor", cursor);
  return `/?${next.toString()}`;
}

/** What the reader asked for, said back to them as the page's one heading. */
function heading(
  q: string,
  selected: string[],
  labels: Map<string, string>,
  place: string | undefined,
): string {
  const one = selected.length === 1 ? labels.get(selected[0]!) : undefined;
  const what =
    q.length >= 2
      ? `Recherche « ${q} »`
      : (one ?? (selected.length > 1 ? `${selected.length} métiers` : "Professionnels"));
  return place ? `${what} à ${place}` : what;
}

/** React's CSSProperties has no room for a custom property, and the mockup sets this one. */
function stackGap(value: string): CSSProperties {
  return { "--stack-gap": value } as CSSProperties;
}
