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
 * <p>The "Mode" fieldset is here now. A comment in this place claimed for
 * months that `GET /v1/providers` took no fulfilment parameter and that the
 * three boxes would submit and change nothing. It takes one, repeatable, and
 * has since it was published - so the boxes were missing from a filter that
 * was already built and already tested.
 */
/** The three the contract publishes, in the words the product already uses. */
const MODES = [
  { value: "ON_SITE", label: "Sur place" },
  { value: "AT_CUSTOMER", label: "À domicile" },
  { value: "DROP_OFF", label: "Dépôt" },
] as const;

export function Filters({
  variant,
  q,
  selected,
  locality,
  area,
  fulfilment,
  priceMax,
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
  fulfilment: string[];
  priceMax: string;
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

      {/* The three ways of being served, which the contract has taken as a
          repeatable `fulfilment` since it was published - the comment above
          this component said otherwise for months and was simply wrong.
          Nothing here is new server-side: the parameter is documented, and its
          own description pins it to the same source the card's badges read, so
          the filter and the badge cannot disagree.

          Above the trades on purpose. In this market it is the sharpest
          question a customer has - a plumber who comes to the house and one
          who does not are two different services, not two options of one - and
          it is three boxes rather than thirty. */}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label" style={{ padding: 0 }}>
          Comment
        </legend>
        <p className="t-xs" style={{ margin: "-.25rem 0 .75rem" }}>
          Plusieurs choix possibles.
        </p>
        <div className="stack" style={stackGap("var(--s-3)")}>
          {MODES.map((mode) => (
            <label className="check" key={mode.value}>
              <input
                type="checkbox"
                name="fulfilment"
                value={mode.value}
                defaultChecked={fulfilment.includes(mode.value)}
              />
              <span className="check__box">
                <Icon name="check" />
              </span>
              <span className="check__text grow">
                <strong>{mode.label}</strong>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* A ceiling and no floor. `price_from` is already the cheapest thing a
          business sells, so a minimum on it would hide every affordable one
          from somebody who asked for an expensive one - a question nobody has.
          The contract says the same in its own words. */}
      <div className="field">
        <label className="field__label" htmlFor={id("price")}>
          Budget <span className="field__optional">facultatif</span>
        </label>
        <div className="input-group input-group--suffix">
          <input
            className="input"
            id={id("price")}
            name="price_max"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            placeholder="50 000"
            defaultValue={priceMax}
          />
          <span className="input-group__suffix">GNF au plus</span>
        </div>
        <p className="field__hint">
          Le prix de départ du professionnel. Ceux qui n’affichent aucun prix
          n’apparaissent pas.
        </p>
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
