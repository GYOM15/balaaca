import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

export const metadata: Metadata = { title: "Conditions" };

/**
 * Who owes what to whom.
 *
 * <p>Three clauses, and the second and third are the ones a reader comes here
 * for: the price recorded at booking is the price, and a suspension does not
 * cancel the appointments already taken. Both are enforced in the backend, and
 * saying them here is what makes them a commitment rather than an
 * implementation detail.
 */
export default function Terms() {
  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section className="section atmo tex-dots">
          <div className="page page--narrow">
            <nav className="crumbs" aria-label="Fil d’Ariane">
              <Link href="/">Accueil</Link>
              <Icon name="chevron-right" />
              <span aria-current="page">Conditions</span>
            </nav>

            <h1 className="t-h1" style={{ marginTop: "var(--s-4)" }}>
              Conditions d’utilisation
            </h1>

            <div
              className="stack t-measure"
              style={
                { "--stack-gap": "var(--s-6)", marginTop: "var(--s-8)" } as CSSProperties
              }
            >
              <div>
                <h2 className="t-h4">Le contrat vous lie au professionnel</h2>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Balaaca met en relation et gère un agenda. La prestation, son prix et son
                  exécution relèvent de l’établissement chez qui vous réservez.
                </p>
              </div>

              <div>
                <h2 className="t-h4">Le prix affiché est un engagement</h2>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Le montant enregistré au moment de la réservation ne change pas. Un
                  professionnel qui réclamerait un autre montant peut être signalé depuis
                  votre page de suivi.
                </p>
              </div>

              <div>
                <h2 className="t-h4">Suspension d’un établissement</h2>
                <p className="t-body" style={{ marginTop: "var(--s-2)" }}>
                  Un établissement signalé peut être retiré des pages publiques. Les
                  rendez-vous déjà pris restent valables&nbsp;: la suspension ne les annule
                  pas.
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

