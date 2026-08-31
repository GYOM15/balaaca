import Link from "next/link";
import { publicApi } from "@/lib/api";
import { Icon, TradeIcon } from "@/components/icon";
import { ProviderCard } from "@/components/provider-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ActionButton, Button, EmptyState, SectionHead } from "@/components/ui";
import type {
  AreaList,
  CategoryList,
  LocalityList,
  LocalityView,
  ProviderSummaryPage,
} from "@/lib/types";
import { groupLocalities, localityLabel } from "@/lib/localities";

/** The directory changes when a provider publishes. A stale hub hides a new business. */
export const dynamic = "force-dynamic";

/**
 * What people actually type. Not decoration: each one is a real query, and the
 * point is to teach in four words that the box takes a trade, a place, or a
 * need - which no placeholder can say on its own.
 */
const EXAMPLES = [
  "Tresses à Ratoma",
  "Photographe mariage",
  "Traiteur 50 couverts",
  "Location de salle Kindia",
];


type Search = {
  q?: string;
  category_slug?: string | string[];
  locality?: string;
  area?: string;
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
        limit: 24,
      },
    }),
  ]);

  const labels = new Map(categories.data.map((c) => [c.slug, c.label_fr]));
  const asked =
    q.length >= 2 || selected.length > 0 || locality.length > 0 || area.length > 0;
  const shown = results.data.slice(0, 9);

  return (
    <div className="site">
      <SiteHeader />

      <main id="contenu">
        <section className="search-band on-dark" aria-labelledby="hub-lead">
          <div className="container container--landing stack stack-6">
            {/* An h1, and the biggest thing on the page. The mockup's hub had
                neither: its two headings were 12 px and 79 % of its characters
                sat at 12 or 14, so nothing was larger than anything. */}
            <h1 className="search-band__lead search-band__lead--display" id="hub-lead">
              Trouvez un professionnel près de chez vous et réservez votre
              créneau en ligne.
            </h1>

            {/* GET, so a search is a URL: it can be shared, bookmarked, and the
                back button returns to the results rather than to an empty box. */}
            <form className="stack stack-3" method="get" action="/">
              <div className="searchbox">
                <div className="searchbox__field">
                  <span className="searchbox__icon" aria-hidden="true">
                    <Icon name="search" size={20} />
                  </span>
                  <input
                    className="searchbox__input"
                    type="search"
                    name="q"
                    defaultValue={q}
                    autoComplete="off"
                    aria-label="Métier, nom ou quartier"
                    placeholder="Tresses, photographe, Kaloum…"
                  />
                </div>
                <div className="searchbox__row">
                  <select
                    className="select"
                    name="locality"
                    defaultValue={locality}
                    aria-label="Région, préfecture ou commune"
                  >
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
                  </select>

                  {/* Un datalist et pas un select : le quartier est du texte
                      libre côté serveur, parce que les quartiers de Guinée se
                      comptent par milliers et que la plateforme ne les écrit
                      pas. On propose ce qui existe déjà sans interdire le
                      reste - ce qui est exactement ce que fait le serveur. */}
                  <input
                    className="input"
                    type="text"
                    name="area"
                    list="quartiers"
                    defaultValue={area}
                    autoComplete="off"
                    aria-label="Quartier"
                    placeholder="Quartier"
                  />
                  <datalist id="quartiers">
                    {areas.data.map((a) => (
                      <option key={a.label} value={a.label} />
                    ))}
                  </datalist>

                  <ActionButton label="Rechercher" variant="accent" type="submit" icon="search" />
                </div>
              </div>
              <p className="searchbox__hint">
                Un métier, un nom d’entreprise ou une prestation.
              </p>
            </form>

            <div className="examples" role="group" aria-label="Exemples de recherche">
              <span className="examples__label">Par exemple</span>
              {EXAMPLES.map((e) => (
                <Link key={e} className="example" href={`/?q=${encodeURIComponent(e)}`}>
                  <Icon name="search" size={13} />
                  {e}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {asked ? null : (
          <section
            className="container container--landing section stack stack-6"
            aria-labelledby="hub-trades"
          >
            <div className="row row--between row-4 row--wrap">
              <div className="row row-3">
                <span className="rule-accent" aria-hidden="true" />
                <h2 className="t-label" id="hub-trades">Parcourir par métier</h2>
              </div>
              <span className="t-caption t-dim tnum">{categories.data.length} métiers</span>
            </div>
            <div className="trade-grid">
              {categories.data.map((t) => (
                <Link
                  key={t.slug}
                  className="trade"
                  href={`/?category_slug=${encodeURIComponent(t.slug)}`}
                >
                  <span className="trade__icon" aria-hidden="true">
                    <TradeIcon slug={t.slug} size={28} />
                  </span>
                  <span className="trade__label">{t.label_fr}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section
          className="container container--landing section stack stack-6"
          style={asked ? undefined : { paddingTop: 0 }}
          aria-labelledby="hub-prov"
        >
          <SectionHead
            label={asked ? "Résultats" : "Prestataires inscrits"}
            aside={
              results.data.length > 0
                ? `${results.data.length} page${results.data.length > 1 ? "s" : ""} publiée${results.data.length > 1 ? "s" : ""}`
                : undefined
            }
          />

          {results.data.length === 0 ? (
            <EmptyState
              sketch="storefront"
              title={asked ? "Rien ne correspond" : "L’annuaire ouvre bientôt"}
              body={
                asked
                  ? "Essayez un autre mot, une autre ville, ou parcourez les métiers."
                  : "Aucun professionnel n’est encore inscrit. Les métiers ci-dessus vous diront lesquels arrivent en premier."
              }
              action={
                asked ? (
                  <Button label="Voir tous les métiers" variant="secondary" href="/" />
                ) : (
                  <Button
                    label="Inscrire mon activité"
                    variant="primary"
                    href="/inscription"
                    iconEnd="arrow-right"
                  />
                )
              }
            />
          ) : (
            <div className="stack stack-6">
              <div className="prov-grid">
                {shown.map((p) => (
                  <ProviderCard
                    key={p.slug}
                    provider={p}
                    tradeLabel={p.category_slug ? labels.get(p.category_slug) : undefined}
                  />
                ))}
              </div>
              {results.next_cursor ? (
                <div className="row row-3" style={{ justifyContent: "center" }}>
                  <Button
                    label="Voir la suite"
                    variant="secondary"
                    iconEnd="arrow-right"
                    href={nextPage(params, results.next_cursor)}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

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
