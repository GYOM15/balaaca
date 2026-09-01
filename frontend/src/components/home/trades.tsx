import Link from "next/link";
import { Icon, TradeIcon } from "@/components/icon";
import type { Family, Trade } from "./taxonomy";

/**
 * The family glyphs the sprite holds, by the family slug they are drawn for.
 *
 * <p>A `use` at an id nothing defines draws an empty box, which reads as a
 * layout bug rather than as a missing drawing - so a ninth family added to the
 * taxonomy falls back to the grid mark until somebody draws it.
 */
const FAMILY_GLYPHS: ReadonlySet<string> = new Set([
  "beaute",
  "bien-etre",
  "atelier",
  "evenement",
  "table",
  "auto",
  "maison",
  "savoir",
]);

export function Trades({
  busiest,
  families,
  total,
}: {
  busiest: Trade[];
  families: Family[];
  total: number;
}) {
  return (
    <section className="section atmo">
      {/* A watermark is neither an icon nor a scene: its own viewBox, and the
          stylesheet places and fades it. */}
      <svg className="wm wm--tr" viewBox="0 0 24 24" aria-hidden="true">
        <use href="#i-grid" />
      </svg>
      <div className="page">
        <div className="section-head">
          <div className="section-head__text">
            <p className="t-overline">Par métier</p>
            <h2 className="t-h2">Là où il y a déjà du monde</h2>
            <p className="t-body">
              Les métiers ci-dessous comptent des professionnels inscrits près de chez
              vous. Les autres arrivent.
            </p>
          </div>
          <Link className="link-action" href="/metiers">
            Voir les {total} métiers <Icon name="arrow-right" size={18} className="ico--arrow" />
          </Link>
        </div>
        <div className="families" style={{ marginBottom: "var(--s-6)" }} data-reveal="fade">
          <Link className="family is-active" href="/metiers">
            <Icon name="grid" size={18} /> Tous
          </Link>
          {families.map((family) =>
            family.slug === null ? null : (
              <Link
                key={family.slug}
                className="family"
                href={`/metiers?family=${encodeURIComponent(family.slug)}`}
              >
                <svg className="ico ico--sm" aria-hidden="true" focusable="false">
                  <use
                    href={FAMILY_GLYPHS.has(family.slug) ? `#f-${family.slug}` : "#i-grid"}
                  />
                </svg>{" "}
                {family.label_fr}
              </Link>
            ),
          )}
        </div>
        <div className="trades" data-reveal-group>
          {busiest.map((t) => (
            <Link
              key={t.slug}
              className="trade"
              href={`/?category_slug=${encodeURIComponent(t.slug)}`}
            >
              <span className="trade__icon">
                <TradeIcon slug={t.slug} />
              </span>
              <span className="grow">
                <span className="trade__name">{t.label_fr}</span>
                <span className="trade__count">
                  {t.provider_count} professionnel{t.provider_count > 1 ? "s" : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
