import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@/components/icon";
import { SiteFooter, SiteHeader } from "@/components/site";

/**
 * The pricing page, honest about being unfinished.
 *
 * <p>Static, and deliberately so: there is no billing endpoint, no plan on the
 * contract and nothing to read. What the page states is the STRUCTURE the grid
 * will take - the two tiers, what each holds, and where the amount will sit -
 * and every undecided amount says so. A plausible price invented to fill a
 * card is a commitment nobody made.
 *
 * <p>Buttons are plain anchors carrying the mockup's own classes, for the same
 * reason as the pitch: `ui.tsx`'s `Button` was written against the previous
 * stylesheet's variants.
 */
export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "La grille définitive n’est pas encore arrêtée. Voici la structure " +
    "retenue, ce que chaque palier contient, et ce qui ne changera pas.",
};

/**
 * The currency, named once.
 *
 * <p>No amount on this page has a value yet, so `money()` has nothing to
 * format; the slot still has to name a currency, and it must be the one place
 * that does.
 */
const CURRENCY = "GNF";

/**
 * The two tiers, as the mockup states them.
 *
 * <p>The limits are editorial. Nothing on the contract carries a plan, a quota
 * or a subscription, so no screen enforces any of this yet - it describes
 * where the line will be drawn, not a line the server draws today.
 */
const PLANS: {
  name: string;
  tagline: string;
  featured?: boolean;
  features: string[];
}[] = [
  {
    name: "Essai",
    tagline: "Le temps de voir si vos clients réservent.",
    features: [
      "Page publique et QR code",
      "Une personne réservable",
      "Jusqu’à 5 prestations",
      "Agenda jour et semaine",
    ],
  },
  {
    name: "Établissement",
    tagline: "Pour un salon, un atelier ou un garage qui tourne.",
    featured: true,
    features: [
      "Tout ce que contient Essai",
      "Équipe illimitée",
      "Prestations illimitées",
      "Fermetures et congés",
      "Fiches clients et notes privées",
    ],
  },
];

/** What no tier changes, whatever the grid turns out to be. */
const CONSTANTS: [string, string, string][] = [
  [
    "lock",
    "Aucune commission",
    "Balaaca ne prend rien sur ce que vous facturez. Vous encaissez vos clients directement, comme aujourd’hui.",
  ],
  [
    "link",
    "Votre adresse reste la vôtre",
    "Le lien et le QR code que vous imprimez ne changent jamais, quel que soit le palier choisi.",
  ],
  [
    "download",
    "Vous partez avec vos clients",
    "Vos rendez-vous et vos fiches clients vous appartiennent. Rien n’est retenu en otage.",
  ],
];

/** `true` is a tick, `false` a dash, a string its own figure. */
type Cell = boolean | string;

const COMPARISON: [string, [string, Cell, Cell][]][] = [
  [
    "Votre vitrine",
    [
      ["Page publique et lien court", true, true],
      ["QR code et affiche à imprimer", true, true],
      ["Photos par prestation", "5", "5"],
      ["Nombre de prestations", "5", "Illimité"],
    ],
  ],
  [
    "Votre agenda",
    [
      ["Réservation sans compte client", true, true],
      ["Vue jour et vue semaine", true, true],
      ["Confirmation automatique ou manuelle", true, true],
      ["Clients sans rendez-vous", true, true],
      ["Fermetures et congés", false, true],
    ],
  ],
  [
    "Votre équipe",
    [
      ["Personnes réservables", "1", "Illimité"],
      ["Agenda par personne", false, true],
      ["Invitation et transfert de propriété", false, true],
    ],
  ],
  [
    "Vos clients",
    [
      ["Notifications WhatsApp", true, true],
      ["Fiches clients et historique", false, true],
      ["Note privée par client", false, true],
    ],
  ],
];

const FAQ: [string, string][][] = [
  [
    [
      "Quand faudra-t-il payer ?",
      "Jamais sans prévenir. Le montant et la date de début seront annoncés à l’avance, et votre page ne sera pas coupée du jour au lendemain.",
    ],
    [
      "Puis-je changer de palier ?",
      "Oui, dans les deux sens. Passer d’Établissement à Essai désactive les fonctions concernées mais ne supprime rien : vos données restent en place.",
    ],
    [
      "Et si je m’arrête ?",
      "Votre page cesse d’être publique. Vos rendez-vous à venir restent visibles dans votre agenda le temps de les honorer.",
    ],
  ],
  [
    [
      "Y a-t-il des frais par réservation ?",
      "Non. Le nombre de réservations n’entre pas dans le tarif, et il n’y a aucun coût à la transaction.",
    ],
    [
      "Faut-il un ordinateur ?",
      "Non. Tout fonctionne depuis un téléphone Android d’entrée de gamme, et la page reste utilisable sur une connexion lente.",
    ],
    [
      "Puis-je essayer avant de décider ?",
      "Oui. Créez votre page, ajoutez une prestation et vos horaires, et publiez. Rien n’est facturé pour l’instant.",
    ],
  ],
];

const SUMMARY_STYLE = {
  cursor: "pointer",
  listStyle: "none",
  gap: "var(--s-3)",
} as const;

export default function Pricing() {
  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section
          className="section atmo tex-halo"
          style={{ paddingBottom: "var(--s-10)" }}
        >
          <svg
            className="wm wm--tr wm--gold"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <use href="#i-tag" />
          </svg>
          <div className="page">
            <nav className="crumbs" aria-label="Fil d’Ariane">
              <Link href="/professionnels">Espace professionnel</Link>
              <Icon name="chevron-right" />
              <span aria-current="page">Tarifs</span>
            </nav>
            <div style={{ marginTop: "var(--s-5)", maxWidth: "54ch" }}>
              <h1 className="t-h1" data-enter="1">
                Tarifs
              </h1>
              <p
                className="t-lead"
                style={{ marginTop: "var(--s-3)" }}
                data-enter="2"
              >
                La grille définitive n’est pas encore arrêtée. Voici la
                structure retenue, ce que chaque palier contient, et ce qui ne
                changera pas.
              </p>
            </div>

            <div
              className="cols cols--2"
              style={{ gap: "var(--s-5)", marginTop: "var(--s-10)" }}
              data-reveal-group
            >
              {PLANS.map((plan) => (
                <div
                  className="card card--pad"
                  key={plan.name}
                  style={
                    plan.featured
                      ? {
                          borderColor: "var(--brand)",
                          boxShadow: "inset 0 0 0 1px var(--brand)",
                        }
                      : undefined
                  }
                >
                  {plan.featured ? (
                    <span
                      className="badge badge--brand"
                      style={{ marginBottom: "var(--s-3)" }}
                    >
                      <Icon name="star" /> Le plus courant
                    </span>
                  ) : null}
                  <h2 className="t-h3">{plan.name}</h2>
                  <p className="t-sm" style={{ marginTop: "var(--s-2)" }}>
                    {plan.tagline}
                  </p>
                  <div
                    style={{
                      marginTop: "var(--s-5)",
                      padding: "var(--s-4)",
                      background: "var(--bg-sunken)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    <div
                      className="t-price t-price--lg"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      À définir{" "}
                      <span className="t-price__currency">
                        {CURRENCY} / mois
                      </span>
                    </div>
                    <p className="t-xs" style={{ marginTop: "var(--s-2)" }}>
                      Le montant sera annoncé avant toute facturation, et jamais
                      appliqué rétroactivement.
                    </p>
                  </div>
                  <ul
                    className="stack"
                    style={
                      {
                        "--stack-gap": "var(--s-3)",
                        marginTop: "var(--s-5)",
                      } as CSSProperties
                    }
                  >
                    {plan.features.map((f) => (
                      <li
                        className="row"
                        style={{ alignItems: "flex-start", gap: "var(--s-3)" }}
                        key={f}
                      >
                        <span style={{ color: "var(--success)" }}>
                          <Icon name="check" size={18} />
                        </span>
                        <span className="t-sm">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: "var(--s-6)" }}>
                    <Link
                      className={
                        plan.featured
                          ? "btn btn--primary btn--block"
                          : "btn btn--secondary btn--block"
                      }
                      href="/inscription"
                    >
                      <span className="btn__label--idle">Créer ma page</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="section section--dark on-dark atmo grain grain--dark"
          style={{ paddingBlock: "var(--s-12)" }}
        >
          <div className="page">
            <div className="valueband" data-reveal-group>
              {CONSTANTS.map(([icon, title, body]) => (
                <div className="valueband__item" key={title}>
                  <span style={{ color: "var(--accent)" }}>
                    <Icon name={icon} size={32} />
                  </span>
                  <h3
                    className="t-h4"
                    style={{ color: "#fff", marginTop: "var(--s-4)" }}
                  >
                    {title}
                  </h3>
                  <p
                    className="t-body"
                    style={{
                      color: "var(--text-on-dark-muted)",
                      marginTop: "var(--s-2)",
                    }}
                  >
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section atmo tex-dots">
          <div className="page">
            <div className="section-head">
              <div className="section-head__text">
                <p className="t-overline">Le détail</p>
                <h2 className="t-h2">Ce que contient chaque palier</h2>
              </div>
            </div>
            {/* Wider than a telephone, so it scrolls inside its own box rather
                than pushing the page sideways. */}
            <div className="table-wrap" data-reveal>
              <table className="table compare">
                <caption className="sr-only">
                  Ce que contient chaque palier, fonctionnalité par
                  fonctionnalité.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Fonctionnalité</th>
                    {PLANS.map((plan) => (
                      <th scope="col" key={plan.name}>
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map(([group, rows]) => (
                    <Fragment key={group}>
                      <tr className="grouprow">
                        <td colSpan={3}>{group}</td>
                      </tr>
                      {rows.map(([label, trial, business]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td>
                            <CompareCell value={trial} />
                          </td>
                          <td>
                            <CompareCell value={business} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section section--sunken atmo grain">
          <svg className="wm wm--bl" viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-help" />
          </svg>
          <div className="page">
            <div className="section-head">
              <div className="section-head__text">
                <p className="t-overline">Questions</p>
                <h2 className="t-h2">Ce qu’on nous demande le plus</h2>
              </div>
            </div>
            <div className="cols cols--2" style={{ gap: "var(--s-6)" }}>
              {FAQ.map((column, i) => (
                <div
                  className="stack"
                  key={i}
                  style={{ "--stack-gap": "var(--s-2)" } as CSSProperties}
                >
                  {column.map(([question, answer]) => (
                    // <details>, so an answer opens with no JavaScript and the
                    // browser's own find-in-page reaches the closed ones.
                    <details className="card card--pad-sm" key={question}>
                      <summary
                        className="row row--between"
                        style={SUMMARY_STYLE}
                      >
                        <span className="t-strong">{question}</span>
                        <Icon name="chevron-down" size={18} />
                      </summary>
                      <p className="t-sm" style={{ marginTop: "var(--s-3)" }}>
                        {answer}
                      </p>
                    </details>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/** A tick, a dash, or the figure itself. */
function CompareCell({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <Icon name="check" />
        <span className="sr-only">Inclus</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span className="no">
          <Icon name="minus" />
        </span>
        <span className="sr-only">Non inclus</span>
      </>
    );
  }
  return <span className="t-sm t-strong">{value}</span>;
}
