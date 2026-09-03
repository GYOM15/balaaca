import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

export const metadata: Metadata = { title: "Confidentialité" };

/**
 * What is kept, and by whom.
 *
 * <p>Four promises, and each one is a decision the product already made rather
 * than a clause: the contact details go to the provider and stay there, no
 * coordinate is ever taken, there is no customer account to hold anything, and
 * only free slots are published. Nothing here is boilerplate, so nothing here
 * is abbreviated.
 */
export default function Privacy() {
  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section className="section atmo tex-dots">
          <div className="page page--narrow">
            <nav className="crumbs" aria-label="Fil d’Ariane">
              <Link href="/">Accueil</Link>
              <Icon name="chevron-right" />
              <span aria-current="page">Confidentialité</span>
            </nav>

            <h1 className="t-h1" style={{ marginTop: "var(--s-4)" }}>
              Confidentialité
            </h1>

            <div
              className="stack t-measure"
              style={
                { "--stack-gap": "var(--s-6)", marginTop: "var(--s-8)" } as CSSProperties
              }
            >
              <div>
                <h2 className="t-h4">Vos coordonnées vont au prestataire</h2>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Quand vous réservez, votre nom et votre numéro de téléphone sont
                  transmis à l’établissement choisi.{" "}
                  <strong className="t-strong">C’est ce professionnel qui les conserve</strong>,
                  dans sa fiche client, afin de vous reconnaître lors de vos prochaines
                  visites. Il peut y ajouter une note privée qui ne vous est pas montrée.
                </p>
              </div>

              <div>
                <h2 className="t-h4">Aucune position géographique</h2>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Pour une prestation à domicile, nous demandons une commune, un quartier
                  et des repères écrits. Aucune latitude ni longitude n’est demandée,
                  calculée ou stockée. L’adresse d’un domicile privé n’a pas à devenir une
                  coordonnée.
                </p>
              </div>

              <div>
                <h2 className="t-h4">Pas de compte client</h2>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Il n’existe pas de compte client sur Balaaca. Votre réservation est
                  retrouvée par sa référence, et rien d’autre n’est conservé de votre
                  visite.
                </p>
              </div>

              <div>
                <h2 className="t-h4">Vos horaires ne sont pas publics</h2>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Balaaca publie uniquement les créneaux <em>libres</em> d’un
                  établissement. Il n’existe aucun écran montrant, minute par minute, ce
                  qu’une personne fait de sa journée.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar />
    </>
  );
}

