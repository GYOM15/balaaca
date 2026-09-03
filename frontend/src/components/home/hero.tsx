import Link from "next/link";
import { Icon, Scene, TradeIcon } from "@/components/icon";
import type { LocalityList } from "@/lib/types";
import { LocalityOptions } from "./fields";
import type { Family } from "./taxonomy";

/**
 * Five editorial chips, chosen and worded by hand.
 *
 * <p>Not the busiest trades. "Vidange" is not a trade at all - it is the one
 * thing everybody asks a garage for - and a row that reorders itself as
 * providers register is a row nobody can learn.
 */
const SUGGESTIONS: { slug: string; label: string }[] = [
  { slug: "tresses", label: "Tresses" },
  { slug: "mecanique-auto", label: "Vidange" },
  { slug: "couture", label: "Couture" },
  { slug: "plomberie", label: "Plomberie" },
  { slug: "traiteur", label: "Traiteur" },
];

export function Hero({
  q,
  trade,
  locality,
  families,
  localities,
}: {
  q: string;
  trade: string;
  locality: string;
  families: Family[];
  localities: LocalityList;
}) {
  return (
    <section className="hero atmo grain grain--dark tex-halo tex-halo--dark">
      <div className="page hero__in">
        <p className="hero__eyebrow" data-enter="1">
          <Icon name="pin" size={18} /> Conakry et l’intérieur du pays
        </p>
        <h1 className="t-display hero__title" data-enter="2">
          Le bon professionnel, <em>à l’heure qui vous arrange.</em>
        </h1>
        <p className="hero__sub" data-enter="3">
          Coiffure, mécanique, couture, traiteur, plomberie&nbsp;: voyez ce qu’il fait,
          ce que ça coûte, et réservez. Sans créer de compte.
        </p>

        <div data-enter="4">
          {/* GET, so a search is a URL: it can be shared, bookmarked, and the
              back button returns to the results rather than to an empty box.
              The action is this same route - the directory is not a second
              page, it is what this one renders once something has been asked. */}
          <form
            className="search"
            action="/"
            method="get"
            role="search"
            aria-label="Rechercher un professionnel"
          >
            <div className="search__row">
              <div className="search__cell">
                <label className="search__label" htmlFor="hero-q">
                  Que cherchez-vous
                </label>
                <input
                  className="search__control"
                  id="hero-q"
                  name="q"
                  type="search"
                  placeholder="Tresses, vidange, robe sur mesure…"
                  defaultValue={q}
                />
              </div>
              <div className="search__cell">
                <label className="search__label" htmlFor="hero-metier">
                  Métier
                </label>
                {/* defaultValue and not a selected option: React refuses the
                    attribute on an option and marks the value on the select. */}
                <select
                  className="search__control"
                  id="hero-metier"
                  name="category_slug"
                  defaultValue={trade}
                >
                  <option value="">Tous les métiers</option>
                  {families.map((family) => (
                    <optgroup key={family.slug ?? "-"} label={family.label_fr}>
                      {family.trades.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.label_fr}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="search__cell">
                <label className="search__label" htmlFor="hero-lieu">
                  Où
                </label>
                <select
                  className="search__control"
                  id="hero-lieu"
                  name="locality"
                  defaultValue={locality}
                >
                  <LocalityOptions localities={localities} />
                </select>
              </div>
              <div className="search__submit">
                <button
                  className="btn btn--primary btn--lg btn--block search__btn"
                  type="submit"
                >
                  <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                    <Icon name="search" size={18} />
                  </span>
                  <span className="btn__label--idle">Rechercher</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="suggest" data-enter="5">
          <span className="suggest__label">Souvent demandé&nbsp;:</span>
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.slug}
              className="suggest__chip"
              href={`/?category_slug=${encodeURIComponent(s.slug)}`}
            >
              <TradeIcon slug={s.slug} size={18} /> {s.label}
            </Link>
          ))}
        </div>
      </div>
      <Scene name="storefront" className="hero__deco" />
    </section>
  );
}
