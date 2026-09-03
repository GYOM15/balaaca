import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, Scene, TradeIcon } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";
import { Button, EmptyState } from "@/components/ui";
import { publicApi } from "@/lib/api";
import { COLLECTIONS, tradeHeading } from "@/lib/collections";
import { mediaUrl } from "@/lib/format";
import type { CategoryList, ProviderSummary, ProviderSummaryPage } from "@/lib/types";

/** Who is registered under a selection changes daily; nothing here is cached. */
export const dynamic = "force-dynamic";

/** The same sentence closes all four leads: it describes the product, not the occasion. */
const PROMISE =
  "Chaque professionnel affiche ses prestations, ses prix et ses disponibilités, et vous réservez dans l’ordre qui vous arrange.";

/** How many professionals a trade's own section shows before "Voir les N". */
const SHOWN = 3;

/**
 * How many entries the one directory call asks for.
 *
 * <p>A selection is a single query over every one of its trades - that is what
 * the contract says the repeated `category_slug` is for - and the directory
 * answers it ordered by business name, so the trades interleave. Sixty is well
 * above what the whole selection can show (eight trades at three each) and
 * leaves room for that interleaving. It is not a guarantee: a trade holding
 * fifty businesses can still push a rarer one off this page, and that section
 * then draws its empty state while its own counter says otherwise.
 */
const WINDOW = 60;

type Category = CategoryList["data"][number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = COLLECTIONS.find((c) => c.slug === slug);
  if (!collection) return {};
  return { title: collection.title, description: `${collection.lead} ${PROMISE}` };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = COLLECTIONS.find((c) => c.slug === slug);
  if (!collection) notFound();

  const [categories, page] = await Promise.all([
    publicApi<CategoryList>("/v1/categories"),
    publicApi<ProviderSummaryPage>("/v1/providers", {
      query: { category_slug: [...collection.trades], limit: WINDOW },
    }),
  ]);

  const known = new Map(categories.data.map((c) => [c.slug, c]));
  const trades = collection.trades
    .map((s) => known.get(s))
    .filter((t): t is Category => t !== undefined);
  if (trades.length === 0) notFound();

  // Grouped here rather than asked for trade by trade: one query over several
  // trades is what the directory's `category_slug` is for.
  const byTrade = new Map<string, ProviderSummary[]>(trades.map((t) => [t.slug, []]));
  for (const provider of page.data) {
    const bucket = provider.category_slug ? byTrade.get(provider.category_slug) : undefined;
    if (bucket && bucket.length < SHOWN) bucket.push(provider);
  }

  // A provider holds one trade, so the counts do not overlap and their sum is
  // the number of businesses this selection reaches.
  const registered = trades.reduce((sum, t) => sum + t.provider_count, 0);

  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section
          className="hero atmo grain grain--dark tex-halo tex-halo--dark"
          style={{ paddingBottom: "var(--s-10)" }}
        >
          <Scene name={collection.scene} className="wm wm--tr wm--dark" />
          <div className="page hero__in" style={{ paddingBottom: "var(--s-10)" }}>
            <nav className="crumbs" aria-label="Fil d’Ariane">
              <Link href="/">Accueil</Link>
              <Icon name="chevron-right" />
              <Link href="/idees">Idées</Link>
              <Icon name="chevron-right" />
              <span aria-current="page">{collection.title}</span>
            </nav>
            <p className="hero__eyebrow" style={{ marginTop: "var(--s-5)" }} data-enter="1">
              <Icon name="sparkle" size={18} /> Sélection
            </p>
            <h1 className="t-display hero__title" data-enter="2">
              {collection.title}
            </h1>
            <p className="hero__sub" data-enter="3">
              {collection.lead} {PROMISE}
            </p>
            <div
              className="row row--wrap"
              style={{ marginTop: "var(--s-8)", gap: "var(--s-6)" }}
              data-enter="4"
            >
              <span
                className="row"
                style={{
                  gap: "var(--s-2)",
                  color: "var(--accent)",
                  fontWeight: 700,
                  fontSize: "var(--fs-sm)",
                }}
              >
                <Icon name="grid" size={18} /> {trades.length} métiers
              </span>
              <span
                className="row"
                style={{
                  gap: "var(--s-2)",
                  color: "var(--text-on-dark-muted)",
                  fontWeight: 600,
                  fontSize: "var(--fs-sm)",
                }}
              >
                <Icon name="users" size={18} /> {registered} professionnels sur Balaaca
              </span>
            </div>
            <div className="collection__trades" style={{ marginTop: "var(--s-6)" }} data-enter="5">
              {trades.map((t) => (
                <a key={t.slug} className="suggest__chip" href={`#g-${t.slug}`}>
                  <TradeIcon slug={t.slug} size={18} /> {t.label_fr}
                </a>
              ))}
            </div>
          </div>
        </section>

        {trades.map((t, i) => {
          const sunken = i % 2 === 1;
          const found = byTrade.get(t.slug) ?? [];
          return (
            <section
              key={t.slug}
              id={`g-${t.slug}`}
              className={sunken ? "section section--sunken atmo grain" : "section atmo tex-dots"}
              style={{ paddingBlock: "var(--s-10)" }}
            >
              <div className="page">
                <div className="section-head" style={{ marginBottom: "var(--s-6)" }}>
                  <div className="section-head__text">
                    <p className="t-overline">
                      <TradeIcon slug={t.slug} size={16} /> {t.label_fr}
                    </p>
                    <h2 className="t-h3">{tradeHeading(t.slug, t.label_fr)}</h2>
                  </div>
                  <Link
                    className="link-action"
                    href={`/?category_slug=${encodeURIComponent(t.slug)}`}
                  >
                    Voir les {t.provider_count}{" "}
                    <Icon name="arrow-right" size={18} className="ico--arrow" />
                  </Link>
                </div>
                {found.length > 0 ? (
                  <div className="pcards" data-reveal-group="">
                    {found.map((p) => (
                      <ProviderTile key={p.slug} provider={p} tradeLabel={t.label_fr} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title={`Aucun ${t.label_fr.toLocaleLowerCase("fr")} inscrit pour l’instant`}
                    body="Ce métier fait partie de la sélection, mais personne ne s’y est encore inscrit."
                    action={
                      <Button
                        href="/professionnels"
                        variant="secondary"
                        size="sm"
                        label="Vous exercez ce métier ?"
                      />
                    }
                  />
                )}
              </div>
            </section>
          );
        })}
      </main>

      <SiteFooter />
      <TabBar />
    </>
  );
}

/**
 * A professional, as a selection's trade section lists them.
 *
 * <p>No footer band. The design puts the service modes and a starting price
 * there, and `ProviderSummary` carries neither - the modes live on the
 * services, and the cheapest of them is a figure only the provider's own page
 * can state truthfully. An empty band would be a rule and some padding around
 * nothing.
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

