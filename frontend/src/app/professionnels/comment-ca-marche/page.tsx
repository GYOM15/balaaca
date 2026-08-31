import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { Sketch } from "@/components/sketch";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Button } from "@/components/ui";

/**
 * The long answer, moved off the pitch.
 *
 * <p>Static, like the rest of the showcase: nothing here is read from the API.
 *
 * <p>This is where the six steps, the preview of a public page and the FAQ
 * live, because a provider who is still deciding does not need them and a
 * provider who has decided needs all of them. Splitting them off is what took
 * the pitch from eight phone screens to three.
 */
export const metadata: Metadata = {
  title: "Comment ça marche",
  description:
    "De votre première visite à votre premier rendez-vous : six étapes, et " +
    "les questions que l’on nous pose le plus souvent.",
};

/**
 * The order is the product's, not a presentation's: a link cannot be shared
 * before the page exists, and a slot cannot be offered before an opening hour
 * and a duration say how long it lasts.
 */
const STEPS = [
  {
    icon: "store",
    title: "Créez votre page",
    text:
      "Le nom de votre activité, votre métier, votre quartier et quelques " +
      "phrases de présentation. Vous obtenez un lien court, qui s’ouvre sans " +
      "installation et sans compte.",
    detail:
      "Une couturière de Madina, un loueur de salle de Kindia et un DJ de " +
      "Bambeto remplissent le même formulaire.",
  },
  {
    icon: "list",
    title: "Décrivez vos prestations",
    text:
      "Pour chacune : un nom, une description, une durée et un prix. La durée " +
      "sert à calculer les créneaux réellement disponibles.",
    detail:
      "Le prix peut rester masqué, prestation par prestation. La durée, elle, " +
      "reste toujours visible.",
  },
  {
    icon: "clock",
    title: "Réglez vos horaires",
    text:
      "Vos jours et vos heures d’ouverture, et vos fermetures " +
      "exceptionnelles. Les créneaux proposés à vos clients en découlent " +
      "directement.",
    detail:
      "Un salon fermé le lundi et un traiteur qui ne travaille que le " +
      "week-end décrivent tous les deux leur réalité.",
  },
  {
    icon: "users",
    title: "Ajoutez votre équipe",
    text:
      "Chaque membre a son propre calendrier et ses propres horaires. Un " +
      "client peut demander quelqu’un en particulier, ou vous laisser choisir.",
    detail:
      "Deux photographes dans le même studio ne se marchent plus sur les " +
      "pieds.",
  },
  {
    icon: "share",
    title: "Partagez votre lien",
    text:
      "Sur WhatsApp, sur votre devanture, sur vos affiches, dans votre bio. " +
      "Le lien est court et s’ouvre en une page.",
    detail:
      "C’est le même lien pour tout le monde : vous n’avez qu’une adresse à " +
      "retenir.",
  },
  {
    icon: "calendar-check",
    title: "Recevez, confirmez, suivez",
    text:
      "Les demandes arrivent dans votre agenda, en vue jour ou semaine. Vous " +
      "confirmez, vous marquez terminé, vous notez une absence, vous reportez.",
    detail:
      "Confirmation automatique si vous préférez ne rien avoir à faire. Vos " +
      "clients sont prévenus par WhatsApp.",
  },
];

/** What a public page carries, in the order a thumb meets it. */
const PREVIEW = [
  ["list", "Vos prestations, avec leur durée et leur prix"],
  ["clock", "Vos horaires réels, fermetures comprises"],
  ["calendar-check", "Le bouton Réserver, toujours à portée du pouce"],
];

const FAQ: [string, string][] = [
  [
    "Faut-il un ordinateur ?",
    "Non. Tout se fait depuis un téléphone, y compris la création de votre " +
      "page et la gestion de votre agenda. Balaaca est un site : il n’y a rien " +
      "à télécharger.",
  ],
  [
    "Mes clients doivent-ils créer un compte ?",
    "Non. Ils ouvrent votre lien, choisissent une prestation et un créneau, " +
      "laissent un nom et un numéro. C’est tout.",
  ],
  [
    "Comment mes clients sont-ils prévenus ?",
    "Par WhatsApp : confirmation, rappel avant le rendez-vous, annulation et " +
      "report. C’est le seul canal disponible aujourd’hui.",
  ],
  [
    "Puis-je masquer mes prix ?",
    "Oui, prestation par prestation. La durée reste affichée, pour que le " +
      "client sache combien de temps prévoir.",
  ],
  [
    "Et si un client veut annuler ?",
    "Il retrouve son rendez-vous depuis son lien et peut l’annuler dans le " +
      "délai fixé. Vous le voyez disparaître de votre agenda.",
  ],
];

export default function HowItWorks() {
  return (
    <div className="site">
      <SiteHeader kind="pro" />

      <main id="contenu">
        <section
          className="container container--landing"
          style={{ paddingBlock: "var(--space-12) var(--space-8)" }}
        >
          <div className="stack stack-4">
            <p className="t-label t-label--accent">Comment ça marche</p>
            <h1 className="t-h1" style={{ maxWidth: "20ch" }}>
              De votre première visite à votre premier rendez-vous.
            </h1>
            <p className="t-body-lg t-muted measure" style={{ fontWeight: 400 }}>
              Six étapes. Comptez une vingtaine de minutes pour les cinq
              premières, une seule fois.
            </p>
          </div>
        </section>

        {/* An ordered list, because the order is load-bearing. The number is
            decoration only in the visual sense: a screen reader gets the same
            sequence from the <ol> itself. */}
        <section className="container container--editorial">
          <ol className="stack stack-10">
            {STEPS.map((st, i) => (
              <li className="step" key={st.title}>
                <span className="step__num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="grow stack stack-3">
                  <div className="row row-3">
                    <span className="step__icon" aria-hidden="true">
                      <Icon name={st.icon} size={24} />
                    </span>
                    <h2 className="step__title">{st.title}</h2>
                  </div>
                  <p className="t-body t-muted" style={{ fontWeight: 400 }}>
                    {st.text}
                  </p>
                  <p
                    className="t-small"
                    style={{
                      fontWeight: 400,
                      color: "var(--text-tertiary)",
                      borderLeft: "2px solid var(--accent)",
                      paddingLeft: "var(--space-4)",
                    }}
                  >
                    {st.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* A description and a way in, not a rendering. The mockup embedded a
            provider's entire public page here, live, at 335 px inside a 375 px
            phone - a phone frame drawn inside a phone - which cost an API call
            this page does not otherwise need and showed the reader a page too
            small to read. The link goes to the directory rather than to a
            fixed slug: which providers are published is not something this
            static page can know. */}
        <section
          className="container container--landing section"
          aria-labelledby="hiw-preview"
        >
          <div className="card card--pad-lg stack stack-5">
            <div className="row row-4 row--wrap row--between">
              <h2 className="t-h3" id="hiw-preview">
                Ce que voit votre client
              </h2>
              <span
                aria-hidden="true"
                style={{ color: "var(--accent)", opacity: 0.5 }}
              >
                <Sketch name="storefront" level={2} width={120} />
              </span>
            </div>
            <p className="t-body t-muted measure" style={{ fontWeight: 400 }}>
              Une page, un lien. Le même gabarit sert un studio photo, une
              couturière, un loueur de salle ou un DJ : ce sont vos prestations
              et vos horaires qui le remplissent, pas un modèle à choisir.
            </p>
            <ul className="stack stack-3">
              {PREVIEW.map(([ic, label]) => (
                <li className="benefit" key={label}>
                  <span
                    className="benefit__icon"
                    style={{ color: "var(--accent-strong)" }}
                    aria-hidden="true"
                  >
                    <Icon name={ic as string} size={18} />
                  </span>
                  <span
                    className="benefit__text"
                    style={{ color: "var(--text-primary)", fontWeight: 500 }}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <Button
                label="Voir un exemple de page"
                variant="secondary"
                iconEnd="arrow-right"
                href="/"
              />
            </div>
          </div>
        </section>

        <section
          className="container container--editorial section stack stack-6"
          style={{ paddingTop: 0 }}
          aria-labelledby="hiw-faq"
        >
          <h2 className="t-h3" id="hiw-faq">
            Questions fréquentes
          </h2>
          {/* <details>, so the page needs no JavaScript to open an answer and
              the browser's own find-in-page reaches the closed ones. */}
          <div className="faq">
            {FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}</summary>
                <div className="faq__body">{a}</div>
              </details>
            ))}
          </div>
        </section>

        <section className="cta-band on-dark" aria-labelledby="hiw-cta">
          <div className="container container--landing stack stack-5">
            <h2 className="t-h3" id="hiw-cta" style={{ maxWidth: "20ch" }}>
              Prêt à créer votre page ?
            </h2>
            <div className="row row-3 row--wrap">
              <Button
                label="Inscrire mon activité"
                variant="accent"
                size="lg"
                iconEnd="arrow-right"
                href="/inscription"
              />
              <Button
                label="Voir les tarifs"
                variant="secondary"
                size="lg"
                href="/professionnels/tarifs"
              />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter kind="pro" />
    </div>
  );
}
