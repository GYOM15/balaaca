import type { Metadata } from "next";
import Link from "next/link";
import { Icon, Scene } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";
import { Button } from "@/components/ui";

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

      <main id="contenu" className="has-tabbar">
        <section className="section section--lg">
          <div className="page page--narrow">
            {/* The mockup's own empty block rather than EmptyState: that
                component fixes the drawing at 200 px, and the design system's
                own cap of 220 is what this screen was drawn against. */}
            <div className="empty">
              <Scene name="notebook" className="scene-ill" />
              <div className="empty__title">Cette page n’existe pas</div>
              <p className="empty__body">
                Le lien est peut-être incomplet, ou la page a été retirée. Repartez de
                l’accueil ou cherchez directement un professionnel.
              </p>
              <div className="empty__actions">
                <Button href="/" label="Retour à l’accueil" />
                <Button href="/" label="Chercher un professionnel" variant="secondary" />
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

