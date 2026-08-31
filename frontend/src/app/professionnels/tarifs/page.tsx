import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Badge, Button } from "@/components/ui";

/**
 * The pricing page, honest about being unfinished.
 *
 * <p>Static: nothing here comes from the API, because nothing here is decided.
 * The page shows the STRUCTURE the grid will take - the tiers, what they hold,
 * and where the amount will sit - and marks every undecided line as undecided.
 * A plausible price invented to fill a card is a commitment nobody made, and
 * costs more than a visibly empty slot.
 *
 * <p>This is also the only place the grid appears. The mockup printed the same
 * three cards on the pitch, so a provider met ten em dashes before reaching
 * the sign-up button.
 */
export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "La grille tarifaire n’est pas encore arrêtée : voici les paliers, ce " +
    "qu’ils contiennent, et où se placera le montant.",
};

/**
 * The currency lives in a constant, never in the layout.
 *
 * <p>Amounts on this page have no value yet, so `money()` has nothing to
 * format; the slot below still has to name a currency, and it must be the one
 * place that does. Local to this page on purpose - `@/lib` is not this task's
 * to extend, and this is the only page with a price that is not the API's.
 */
const CURRENCY = "GNF";

/**
 * The lines that hold whatever the tiers turn out to be.
 *
 * <p>Three, and each one is already built. That is the whole test for
 * appearing here without a "à définir" beside it.
 */
const UNIVERSAL = [
  "Page publique et lien court",
  "Réservation sans compte pour vos clients",
  "Protection contre le double créneau",
];

const PLANS = [
  {
    key: "a",
    name: "Palier 1",
    tagline: "Nom à définir",
    note: "Pour une personne seule.",
  },
  {
    key: "b",
    name: "Palier 2",
    tagline: "Nom à définir",
    note: "Pour une équipe.",
    feature: true,
  },
  {
    key: "c",
    name: "Sur mesure",
    tagline: "Sur devis",
    note: "Pour les structures qui ont des besoins particuliers.",
    custom: true,
  },
];

/**
 * A row is ticked only where the answer is decided, and decided means built.
 *
 * <p>`null` is not "no": it is "not yet tranché", and it renders as such. A
 * cross would read as a limit somebody chose.
 */
const ROWS: [string, boolean | null][] = [
  ["Page publique et lien court", true],
  ["Réservation sans compte pour vos clients", true],
  ["Protection contre le double créneau", true],
  ["Confirmation automatique ou manuelle", true],
  ["Annulation par le client depuis son lien", true],
  ["Catalogue de prestations", null],
  ["Nombre de membres de l’équipe", null],
  ["Horaires par personne", null],
  ["Notifications WhatsApp", null],
  ["Accompagnement à la mise en route", null],
];

export default function Pricing() {
  return (
    <div className="site">
      <SiteHeader kind="pro" />

      <main id="contenu">
        <section
          className="container container--landing"
          style={{ paddingBlock: "var(--space-12) var(--space-8)" }}
        >
          <div className="stack stack-4">
            <p className="t-label t-label--accent">Tarifs</p>
            <h1 className="t-h1" style={{ maxWidth: "18ch" }}>
              La grille n’est pas encore arrêtée.
            </h1>
            <p className="t-body-lg t-muted measure" style={{ fontWeight: 400 }}>
              Voici la structure que prendra cette page : les paliers, ce qu’ils
              contiennent, et où se placera le montant. Les prix seront fixés
              avant l’ouverture des inscriptions.
            </p>
          </div>
        </section>

        <section
          className="container container--landing stack stack-10"
          style={{ paddingBottom: "var(--space-16)" }}
        >
          <div className="stack stack-5">
            <div className="plans">
              {PLANS.map((p) => (
                <article
                  className={p.feature ? "plan plan--feature" : "plan"}
                  key={p.key}
                >
                  <div className="stack stack-2">
                    <div className="row row--between row-3 row--wrap">
                      <h2 className="plan__name">{p.name}</h2>
                      {p.feature ? (
                        <Badge tone="brand" label="Emplacement mis en avant" />
                      ) : null}
                    </div>
                    <span className="t-caption t-dim">{p.tagline}</span>
                  </div>

                  <PriceSlot custom={p.custom} />

                  <p className="t-small t-muted" style={{ fontWeight: 400 }}>
                    {p.note}
                  </p>

                  <div className="plan__list">
                    {UNIVERSAL.map((f) => (
                      <span className="plan__item" key={f}>
                        <Icon name="check" size={15} />
                        <span>{f}</span>
                      </span>
                    ))}
                    <span className="plan__item">
                      <span className="todo">Limites et options à définir</span>
                    </span>
                  </div>
                </article>
              ))}
            </div>

            {/* No "choisir ce palier" button on a card with no price. The
                mockup put a disabled one on each, captioned "disponible à
                l'ouverture des inscriptions" - but registration is open, and
                what is missing is the grid, not the door. One live button
                that works, and a sentence that says what is still pending. */}
            <div className="row row-4 row--wrap row--between">
              <p className="t-small t-muted measure" style={{ fontWeight: 400 }}>
                Vous pouvez inscrire votre activité dès maintenant. Le choix
                d’un palier viendra quand la grille sera arrêtée.
              </p>
              <Button
                label="Inscrire mon activité"
                variant="primary"
                iconEnd="arrow-right"
                href="/inscription"
              />
            </div>
          </div>

          <div className="stack stack-5">
            <h2 className="t-h3">Comparatif</h2>
            {/* The table is wider than a phone, so it scrolls in its own box
                rather than pushing the page sideways. */}
            <div className="table-scroll">
              <table className="compare">
                <caption className="sr-only">
                  Comparaison des paliers. Les lignes marquées « à définir » ne
                  sont pas arrêtées.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Fonctionnalité</th>
                    {PLANS.map((p) => (
                      <th scope="col" key={p.key}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(([label, included]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {PLANS.map((p) => (
                        <td key={p.key}>
                          <Cell included={included} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="t-caption t-dim">
              Les lignes marquées « à définir » ne sont pas encore tranchées.
              Celles qui sont cochées le sont dans tous les paliers, parce
              qu’elles sont déjà construites.
            </p>
          </div>

          <div className="card card--pad-lg stack stack-4">
            <h2 className="t-h4">Une question sur un besoin particulier ?</h2>
            <p className="t-small t-muted measure" style={{ fontWeight: 400 }}>
              Plusieurs points de vente, une équipe nombreuse, un métier qui ne
              rentre pas dans les dix-huit : on regarde ensemble, une fois votre
              activité inscrite.
            </p>
            {/* Marked rather than invented. There is no contact page and no
                published address to send anyone to; the mockup's "Nous écrire"
                pointed at a form whose endpoint does not exist. */}
            <p className="t-small">
              <span className="todo">Canal de contact à ouvrir</span>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter kind="pro" />
    </div>
  );
}

/**
 * Where the amount will go.
 *
 * <p>An em dash with an accessible label rather than a number, and the
 * currency out of `CURRENCY`. The slot exists so that fixing the grid is a
 * change of data, not a hunt through the markup for a hard-coded symbol.
 */
function PriceSlot({ custom }: { custom?: boolean }) {
  if (custom) {
    return (
      <>
        <div className="plan__price">
          <span className="plan__amount" style={{ fontSize: "var(--size-h3)" }}>
            Sur devis
          </span>
        </div>
        <span className="plan__period">Après un échange de vingt minutes</span>
      </>
    );
  }
  return (
    <>
      <div className="plan__price">
        <span className="plan__amount" aria-label="Montant à définir">
          —
        </span>
        <span className="plan__currency">{CURRENCY}</span>
      </div>
      <span className="plan__period">
        par mois · <span className="todo">montant à définir</span>
      </span>
    </>
  );
}

/** A tick that reads as one, or the fact that nobody has decided. */
function Cell({ included }: { included: boolean | null }) {
  if (included !== true) return <span className="todo">à définir</span>;
  return (
    <>
      <span className="sr-only">Compris</span>
      <span
        aria-hidden="true"
        style={{ color: "var(--success)", display: "inline-flex" }}
      >
        <Icon name="check" size={18} />
      </span>
    </>
  );
}
