import Link from "next/link";
import { Icon } from "@/components/icon";
import { ActionButton } from "@/components/ui";
import type { AreaList, LocalityList } from "@/lib/types";
import { AreaOptions, LocalityOptions, stackGap } from "./fields";
import type { Trade } from "./taxonomy";

/**
 * The filters, beside the results.
 *
 * <p>One GET form. Everything it holds is a query parameter `listProviders`
 * accepts, which is what makes a filtered directory a link somebody can send.
 *
 * <p>No "Mode" fieldset. The design has one - sur place, dépôt, à domicile -
 * and `GET /v1/providers` takes no fulfilment parameter, so those three boxes
 * would submit and change nothing.
 */
export function Filters({
  variant,
  q,
  selected,
  locality,
  area,
  trades,
  total,
  localities,
  areas,
}: {
  variant: "m" | "d";
  q: string;
  selected: string[];
  locality: string;
  area: string;
  /** The shortlist of trades the panel offers; the rest are on /metiers. */
  trades: Trade[];
  total: number;
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
        <Link
          className="link"
          href="/metiers"
          style={{
            fontSize: "var(--fs-xs)",
            display: "inline-block",
            marginTop: "var(--s-3)",
          }}
        >
          Voir les {total} métiers
        </Link>
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
