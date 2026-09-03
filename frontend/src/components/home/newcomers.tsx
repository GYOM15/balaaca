import Link from "next/link";
import { Icon, Scene } from "@/components/icon";
import type { ProviderSummary } from "@/lib/types";
import { ProviderTile } from "./provider-tile";

/**
 * Six businesses off the top of the directory.
 *
 * <p>"Tout parcourir" points at this same route: the directory is a branch of
 * the home page and not a second address, so browsing everything is arriving
 * here with nothing asked.
 */
export function Newcomers({
  providers,
  labels,
}: {
  providers: ProviderSummary[];
  labels: Map<string, string>;
}) {
  return (
    <section className="section section--sunken atmo grain">
      <Scene name="storefront" className="wm wm--bl" />
      <div className="page">
        <div className="section-head">
          <div className="section-head__text">
            <p className="t-overline">Nouvellement inscrits</p>
            <h2 className="t-h2">
              Des professionnels qui prennent des rendez-vous cette semaine
            </h2>
          </div>
          <Link className="link-action" href="/">
            Tout parcourir <Icon name="arrow-right" size={18} className="ico--arrow" />
          </Link>
        </div>
        <div className="pcards" data-reveal-group>
          {providers.map((p) => (
            <ProviderTile
              key={p.slug}
              provider={p}
              tradeLabel={p.category_slug ? labels.get(p.category_slug) : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
