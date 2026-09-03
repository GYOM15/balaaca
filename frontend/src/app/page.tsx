import { publicApi } from "@/lib/api";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";
import { Collections } from "@/components/home/collections";
import { Directory } from "@/components/home/directory";
import { ForPros } from "@/components/home/for-pros";
import { Fulfilments } from "@/components/home/fulfilments";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { Newcomers } from "@/components/home/newcomers";
import { Places } from "@/components/home/places";
import { Trades } from "@/components/home/trades";
import { byFamily } from "@/components/home/taxonomy";
import type { Asked } from "@/components/home/query";
import type {
  AreaList,
  CategoryList,
  LocalityList,
  ProviderSummaryPage,
} from "@/lib/types";

/** The directory changes when a provider publishes. A stale hub hides a new business. */
export const dynamic = "force-dynamic";

/** How many trades the hub shows before "Voir les N métiers" takes over. */
const TRADES_SHOWN = 12;

/** How many trades the filter panel offers before the same link takes over. */
const TRADES_FILTERED = 14;

/** How many businesses the hub puts on the page. The directory shows the page. */
const PROVIDERS_SHOWN = 6;

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
  const asked: Asked = {
    q: params.q?.trim() ?? "",
    selected: toList(params.category_slug),
    locality: params.locality?.trim() ?? "",
    area: params.area?.trim() ?? "",
  };

  const [categories, localities, areas, results] = await Promise.all([
    publicApi<CategoryList>("/v1/categories"),
    publicApi<LocalityList>("/v1/localities"),
    // The quartiers already written, narrowed to the locality asked for:
    // offering the whole country's while searching Ratoma would be unreadable.
    publicApi<AreaList>("/v1/areas", {
      query: { locality: asked.locality || undefined },
    }),
    publicApi<ProviderSummaryPage>("/v1/providers", {
      query: {
        // Below two characters the API refuses, and rightly: one letter matches
        // most of the directory and answers nothing.
        q: asked.q.length >= 2 ? asked.q : undefined,
        category_slug: asked.selected.length > 0 ? asked.selected : undefined,
        locality: asked.locality || undefined,
        area: asked.area || undefined,
        cursor: params.cursor || undefined,
        limit: 24,
      },
    }),
  ]);

  const labels = new Map(categories.data.map((c) => [c.slug, c.label_fr]));
  const searching =
    asked.q.length >= 2 ||
    asked.selected.length > 0 ||
    asked.locality.length > 0 ||
    asked.area.length > 0;

  // Ranked by how many providers actually hold the trade, which is the only
  // ordering the contract publishes anything for. Alphabetical on a tie.
  //
  // Trades nobody holds are no longer filtered out, they are ranked last and
  // drawn as `.trade--empty`: six businesses in the seed meant six tiles and a
  // band designed for twelve stood half empty. What is never done is padding -
  // the slice takes what the taxonomy holds and stops, so a shorter taxonomy
  // gets a shorter band rather than placeholder boxes.
  const busiest = [...categories.data]
    .sort(
      (a, b) => b.provider_count - a.provider_count || a.label_fr.localeCompare(b.label_fr, "fr"),
    )
    .slice(0, TRADES_SHOWN);

  // The panel offers the head of the published taxonomy, and any trade already
  // being filtered on - a checked box that is not drawn is a filter the next
  // submission would silently drop.
  const shortlist = [
    ...categories.data.slice(0, TRADES_FILTERED),
    ...categories.data
      .slice(TRADES_FILTERED)
      .filter((t) => asked.selected.includes(t.slug)),
  ];

  const families = byFamily(categories.data);
  const places = [...areas.data]
    .sort((a, b) => b.provider_count - a.provider_count || a.label.localeCompare(b.label, "fr"))
    .slice(0, 8);
  const settlements = localities.data.filter((l) => l.kind !== "REGION").length;
  const localityName = localities.data.find((l) => l.slug === asked.locality)?.label_fr;
  const place = asked.area || localityName;

  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        {searching ? (
          <Directory
            asked={asked}
            heading={heading(asked, labels, place)}
            place={place}
            localityName={localityName}
            results={results}
            labels={labels}
            shortlist={shortlist}
            total={categories.data.length}
            localities={localities}
            areas={areas}
          />
        ) : (
          <>
            <Hero
              q={asked.q}
              trade={asked.selected[0] ?? ""}
              locality={asked.locality}
              families={families}
              localities={localities}
            />
            <Fulfilments />
            {/* Same reasoning as the band below, and the empty database is what
                showed it: the heading says "where there are already people" and
                the sentence under it promises a list. With nobody registered
                there is no such place, and the section rendered a title, a
                promise and a family rail over nothing at all. The test is now
                whether ONE trade holds somebody, not whether the slice is
                non-empty - the slice is never empty any more. */}
            {busiest.some((t) => t.provider_count > 0) ? (
              <Trades busiest={busiest} families={families} total={categories.data.length} />
            ) : null}
            {/* Nothing published yet is the state on the first day, and a band
                headed "newly registered" with an empty grid under it says less
                than no band at all. */}
            {results.data.length > 0 ? (
              <Newcomers
                providers={results.data.slice(0, PROVIDERS_SHOWN)}
                labels={labels}
              />
            ) : null}
            <Collections labels={labels} />
            <HowItWorks />
            {places.length > 0 ? <Places places={places} /> : null}
            <ForPros trades={categories.data.length} settlements={settlements} />
          </>
        )}
      </main>

      <SiteFooter />
      {/* The one screen that was reserving the bar's height with `has-tabbar`
          and drawing no bar. Accueil and Rechercher are the design's two
          screens, served here by one route, so the state of the page says
          which of them the reader is on. */}
      <TabBar active={searching ? "recherche" : "accueil"} />
    </>
  );
}

/* --- Plumbing ------------------------------------------------------------- */

/**
 * The contract repeats the parameter rather than joining it.
 *
 * <p>Empty values are dropped. A `<select>` always submits, so leaving the hero
 * on "Tous les métiers" sent `category_slug=`, which counted as a trade being
 * asked for: the hub answered its own search form with an empty result page.
 */
function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((one) => one.trim()).filter(Boolean);
}

/** What the reader asked for, said back to them as the page's one heading. */
function heading(asked: Asked, labels: Map<string, string>, place: string | undefined): string {
  const one = asked.selected.length === 1 ? labels.get(asked.selected[0]!) : undefined;
  const what =
    asked.q.length >= 2
      ? `Recherche « ${asked.q} »`
      : (one ?? (asked.selected.length > 1 ? `${asked.selected.length} métiers` : "Professionnels"));
  return place ? `${what} à ${place}` : what;
}
