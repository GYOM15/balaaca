import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Button, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Page introuvable" };

/**
 * A link that leads nowhere.
 *
 * <p>Two ways out and not one, because there are two reasons to land here: a
 * shortened or mistyped link to a provider's page - which is most of them,
 * since these links travel through WhatsApp - and a page that has been
 * withdrawn. The first needs the search, the second needs the front door.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="contenu">
        <section className="section section--lg">
          <div className="page page--narrow">
            <EmptyState
              sketch="notebook"
              title="Cette page n’existe pas"
              body="Le lien est peut-être incomplet, ou la page a été retirée. Repartez de l’accueil ou cherchez directement un professionnel."
              action={
                <>
                  <Button href="/" label="Retour à l’accueil" />
                  <Button href="/" label="Chercher un professionnel" variant="secondary" />
                </>
              }
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
