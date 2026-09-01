import Link from "next/link";
import { Icon, TradeIcon } from "@/components/icon";
import { COLLECTIONS } from "@/lib/collections";

/**
 * The editorial bands: an occasion is not a trade.
 *
 * <p>The selections themselves live in `lib/collections.ts`, which the
 * `/idees` pages own - so the slug, the title and the drawing are read from
 * there and a retired selection disappears from here rather than leaving a link
 * into nothing. What stays local is what belongs to this page: the shorter
 * trade rows the hub draws, and the wedding band's own sentence.
 */

/** The trade chips each band draws, by `category_slug`. The selections carry more. */
const CHIPS: Record<string, string[]> = {
  mariage: [
    "photographie",
    "traiteur",
    "location-salle",
    "dj-animation",
    "decoration-evenementielle",
    "fleuriste",
  ],
  rentree: ["couture", "cours-particuliers", "cours-langues", "formation-professionnelle"],
  "panne-maison": ["plomberie", "climatisation", "electricite", "energie-solaire"],
};

/** The link card's own box, which the design system has no class for. */
const CARD: React.CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  display: "block",
  padding: "var(--s-6)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  background: "var(--surface)",
  transition: "border-color var(--dur-base) var(--ease-out)",
};

export function Collections({ labels }: { labels: Map<string, string> }) {
  const of = (slug: string) => COLLECTIONS.find((c) => c.slug === slug);
  const wedding = of("mariage");
  const cards = ["rentree", "panne-maison"]
    .map(of)
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  return (
    <section className="section atmo tex-rules">
      <div className="page">
        {wedding ? (
          <div className="collection atmo grain grain--dark" data-reveal="scale">
            <div className="collection__in">
              <div>
                <p className="t-overline" style={{ color: "var(--accent)" }}>
                  Une occasion, plusieurs métiers
                </p>
                <h2 className="t-h1" style={{ marginTop: "var(--s-3)", color: "#fff" }}>
                  {wedding.title}
                </h2>
                <p
                  className="t-lead"
                  style={{
                    color: "var(--text-on-dark-muted)",
                    marginTop: "var(--s-4)",
                    maxWidth: "44ch",
                  }}
                >
                  Le photographe, le traiteur, la salle, le DJ et la décoration.
                  « Mariage » n’est pas un métier&nbsp;: c’est une manière de chercher.
                </p>
                <div className="collection__trades">
                  {(CHIPS[wedding.slug] ?? []).map((slug) => (
                    <Link
                      key={slug}
                      className="suggest__chip"
                      href={`/?category_slug=${encodeURIComponent(slug)}`}
                    >
                      <TradeIcon slug={slug} size={18} /> {labels.get(slug) ?? slug}
                    </Link>
                  ))}
                </div>
                <div style={{ marginTop: "var(--s-6)" }}>
                  <Link className="btn btn--inverse" href={`/idees/${wedding.slug}`}>
                    <span className="btn__label--idle">Ouvrir la sélection mariage</span>
                    <Icon name="arrow-right" size={18} className="ico--arrow" />
                  </Link>
                </div>
              </div>
              <div style={{ display: "grid", placeItems: "center" }}>
                <svg
                  className="scene-ill"
                  viewBox="0 0 200 150"
                  aria-hidden="true"
                  focusable="false"
                  style={{ color: "rgba(255,255,255,.24)", maxWidth: 300 }}
                >
                  <use href={`#s-${wedding.scene}`} />
                </svg>
              </div>
            </div>
          </div>
        ) : null}

        {cards.length > 0 ? (
          <div className="cols cols--2" style={{ marginTop: "var(--s-6)", gap: "var(--s-6)" }}>
            {cards.map((c) => (
              <Link
                key={c.slug}
                href={`/idees/${c.slug}`}
                style={CARD}
                className="card--interactive"
              >
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <h3 className="t-h4">{c.title}</h3>
                    <p className="t-sm" style={{ marginTop: "var(--s-2)" }}>
                      {c.lead}
                    </p>
                    <div
                      className="row row--wrap"
                      style={{ marginTop: "var(--s-4)", gap: "var(--s-2)" }}
                    >
                      {(CHIPS[c.slug] ?? []).map((slug) => (
                        <span className="fact" key={slug}>
                          <TradeIcon slug={slug} />
                          {labels.get(slug) ?? slug}
                        </span>
                      ))}
                    </div>
                  </div>
                  <svg
                    className="scene-ill scene-ill--sm"
                    viewBox="0 0 200 150"
                    aria-hidden="true"
                    focusable="false"
                    style={{ maxWidth: 96, flex: "none" }}
                  >
                    <use href={`#s-${c.scene}`} />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
