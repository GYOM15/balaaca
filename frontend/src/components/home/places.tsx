import Link from "next/link";
import { Icon } from "@/components/icon";
import type { AreaView } from "@/lib/types";

/**
 * Where the businesses already are.
 *
 * <p>Quartiers and not communes, which is the one place this band departs from
 * the design. `GET /v1/areas` is the only endpoint that publishes a place
 * together with a count of the providers in it; `LocalityView` carries no
 * `provider_count`, so a commune tile could only be drawn with the count made
 * up or left blank. The tiles therefore rank the quartiers the providers wrote
 * themselves, and "Tous les lieux" opens the map of communes and prefectures.
 */
export function Places({ places }: { places: AreaView[] }) {
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
            <Link key={a.label} className="trade" href={`/?area=${encodeURIComponent(a.label)}`}>
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
  );
}
