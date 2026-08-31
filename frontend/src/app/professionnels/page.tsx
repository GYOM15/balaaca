import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Sketch } from "@/components/sketch";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Button } from "@/components/ui";

/**
 * The pitch, and the only page where Balaaca talks about Balaaca.
 *
 * <p>Static. It reads nothing, so there is no `force-dynamic` and no `api`
 * call: the deployment can serve it from the edge, which is what a provider
 * on a slow connection notices first.
 *
 * <p>Four sections, not twelve. The mockup put the whole product on this URL -
 * the six detailed steps, a live render of a provider's public page inside a
 * phone frame, the full pricing grid whose every amount was a dash, and the
 * FAQ - and asked a phone to scroll eight screens before the sign-up button
 * came back. The steps and the FAQ moved to `comment-ca-marche`, the grid to
 * `tarifs`. What is left is the argument: here is what goes wrong today, here
 * is what changes, here is the button.
 *
 * <p>One h1 and three h2, all of them at their real size. The mockup had
 * fifteen headings and no hierarchy, because its section labels were `h2`
 * elements set at 12 px next to the titles they were meant to introduce.
 */
export const metadata: Metadata = {
  title: "Pour les professionnels",
  description:
    "Une page de réservation pour votre activité, et un agenda qui tient. " +
    "Vos clients réservent sans créer de compte.",
};

/**
 * Three trades, three ways the same day goes wrong.
 *
 * <p>Named trades, deliberately, and not the same one twice: a caterer does
 * not recognise himself in "votre activité", and a directory of eighteen
 * trades that only ever illustrates hairdressing reads as an app for salons.
 */
const PAINS = [
  {
    trade: "Salon de coiffure",
    text:
      "Le téléphone sonne pendant que vous avez les mains dans les cheveux " +
      "d’une cliente. Vous décrochez, ou vous perdez le rendez-vous.",
  },
  {
    trade: "Studio photo",
    text:
      "Vous découvrez le jeudi que vous vous êtes engagé sur deux mariages le " +
      "même samedi. Il va falloir en décevoir un.",
  },
  {
    trade: "Traiteur",
    text:
      "Les commandes sont notées sur un cahier. Une page se détache, et une " +
      "livraison de cinquante couverts disparaît avec elle.",
  },
];

/** Four claims, and not one of them describes something unbuilt. */
const BENEFITS = [
  {
    title: "Deux clients ne peuvent pas prendre la même heure",
    text:
      "Le refus du doublon est garanti par la base de données, pas par une " +
      "vérification qu’un programme peut oublier.",
  },
  {
    title: "Vos clients réservent sans créer de compte",
    text:
      "Ils ouvrent votre lien, choisissent une prestation, un jour, une " +
      "heure. Rien à installer, rien à retenir.",
  },
  {
    title: "Vous décidez qui confirme",
    text:
      "Confirmation automatique, ou validation à la main avant chaque " +
      "rendez-vous. C’est un réglage, pas une fatalité.",
  },
  {
    title: "Chaque membre a son calendrier",
    text:
      "Un client demande quelqu’un en particulier, ou vous laisse choisir. " +
      "Les horaires se règlent personne par personne.",
  },
];

export default function ProLanding() {
  return (
    <div className="site">
      <SiteHeader kind="pro" />

      <main id="contenu">
        <section className="pitch">
          <span className="pitch__art" aria-hidden="true">
            <Sketch name="storefront" level={3} width={340} />
          </span>
          <div
            className="container container--landing stack stack-6"
            style={{ position: "relative" }}
          >
            {/* An over-title, so a paragraph. It says who the page is for; it
                does not open a section, and it is not a heading. */}
            <p className="t-label t-label--accent">Pour les professionnels</p>
            <h1 className="t-display pitch__title">
              Une page de réservation pour votre activité, et un agenda qui
              tient.
            </h1>
            <p
              className="t-body-lg t-muted pitch__lead"
              style={{ fontWeight: 400 }}
            >
              Vos clients ouvrent votre lien, choisissent une prestation et un
              créneau. Vous recevez le rendez-vous. Deux personnes ne peuvent
              pas prendre la même heure.
            </p>
            <div
              className="row row-3 row--wrap"
              style={{ paddingTop: "var(--space-2)" }}
            >
              <Button
                label="Inscrire mon activité"
                variant="primary"
                size="lg"
                iconEnd="arrow-right"
                href="/inscription"
              />
              {/* The detail lives on its own page now, and this is the door to
                  it. The mockup's second button opened a demo provider whose
                  slug was invented by the mockup's own fixtures. */}
              <Button
                label="Comment ça marche"
                variant="secondary"
                size="lg"
                iconEnd="arrow-right"
                href="/professionnels/comment-ca-marche"
              />
            </div>
          </div>
        </section>

        <section
          className="container container--landing section stack stack-8"
          style={{ paddingTop: 0 }}
          aria-labelledby="pro-pains"
        >
          <h2 className="t-h2" id="pro-pains" style={{ maxWidth: "20ch" }}>
            Un rendez-vous perdu ne se voit pas. Il se compte à la fin du mois.
          </h2>
          <div className="tri">
            {PAINS.map((p) => (
              <article className="pain" key={p.trade}>
                <span className="pain__trade">{p.trade}</span>
                <p className="pain__text">{p.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="container container--landing section stack stack-8"
          style={{ paddingTop: 0 }}
          aria-labelledby="pro-benefits"
        >
          <h2 className="t-h2" id="pro-benefits">
            Ce que ça change
          </h2>
          <div className="duo">
            {BENEFITS.map((b) => (
              <div className="benefit" key={b.title}>
                <span className="benefit__icon" aria-hidden="true">
                  <Icon name="check-circle" size={20} />
                </span>
                <span className="stack stack-1">
                  <span className="benefit__title">{b.title}</span>
                  <span className="benefit__text">{b.text}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* One line, because there is one fact: nothing is priced yet. The
            mockup printed the three plan cards here as well as on the pricing
            page, and every amount in both copies was an em dash. Three cards
            that say nothing cost a screen of scrolling; this sentence says the
            same thing and keeps the reader moving. */}
        <section
          className="container container--landing section"
          style={{ paddingTop: 0 }}
        >
          <p className="t-body t-muted" style={{ fontWeight: 400 }}>
            La grille tarifaire n’est pas encore arrêtée.{" "}
            <Link href="/professionnels/tarifs">
              Voir ce qui est déjà décidé
            </Link>
            .
          </p>
        </section>

        <section className="cta-band on-dark" aria-labelledby="pro-cta">
          <div className="container container--landing stack stack-5">
            <h2 className="t-h2" id="pro-cta" style={{ maxWidth: "26ch" }}>
              Créez votre page. Partagez le lien. C’est tout.
            </h2>
            <p
              className="t-body"
              style={{
                color: "var(--ink-fg-muted)",
                fontWeight: 400,
                maxWidth: "44ch",
              }}
            >
              Il faut une vingtaine de minutes pour décrire vos prestations et
              vos horaires. Ensuite, votre lien travaille pour vous.
            </p>
            <div>
              <Button
                label="Inscrire mon activité"
                variant="accent"
                size="lg"
                iconEnd="arrow-right"
                href="/inscription"
              />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter kind="pro" />
    </div>
  );
}
