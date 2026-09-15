import Link from "next/link";
import { Icon } from "@/components/icon";
import type { LocalityView } from "@/lib/types";

/**
 * Where the businesses already are.
 *
 * <p>Communes and prefectures, which is what the heading under it has always
 * promised. It drew QUARTIERS instead, on the grounds - written here - that
 * `LocalityView` carried no `provider_count` and a commune tile could only be
 * drawn with the number made up or left blank. It carries one, and has for
 * long enough that nobody noticed: the band was reading `/v1/areas` because
 * the note above said to.
 *
 * <p>The distinction matters because a customer thinks in communes. Somebody
 * in Conakry knows they are in Ratoma or in Matam; the quartier they would
 * name is the one they live in, not one of eight the directory happens to
 * rank. And the link filters on `locality`, which walks DOWN the tree - a tile
 * for Conakry returns the businesses filed under every commune in it, while a
 * quartier tile matched one string exactly.
 *
 * <p>Regions are left out. They are containers rather than places somebody
 * says they are from, and "Conakry" as a region would sit beside its own
 * communes counting all of them again.
 */
export function Places({ places }: { places: LocalityView[] }) {
  return (
    <section className="section section--sunken atmo grain">
      <svg className="wm wm--br" viewBox="0 0 24 24" aria-hidden="true">
        <use href="#i-pin" />
      </svg>
      <div className="page">
        <div className="section-head">
          <div className="section-head__text">
            <p className="t-overline">Par lieu</p>
            <h2 className="t-h2">Chercher près de chez soi</h2>
            <p className="t-body">
              Conakry commune par commune, et les villes de l’intérieur.
            </p>
          </div>
          <Link className="link-action" href="/lieux">
            Tous les lieux <Icon name="arrow-right" size={18} className="ico--arrow" />
          </Link>
        </div>
        <div className="trades" data-reveal-group>
          {places.map((a) => (
            <Link key={a.slug} className="trade" href={`/?locality=${encodeURIComponent(a.slug)}`}>
              <span className="trade__icon">
                <Icon name="pin" />
              </span>
              <span className="grow">
                <span className="trade__name">{a.label_fr}</span>
                <span className="trade__count">
                  {a.provider_count} professionnel{a.provider_count > 1 ? "s" : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
