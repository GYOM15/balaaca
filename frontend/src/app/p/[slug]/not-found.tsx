import type { Metadata } from "next";
import Link from "next/link";
import { Icon, Scene } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

export const metadata: Metadata = { title: "Page indisponible" };

/**
 * A business that is no longer shown.
 *
 * <p>Unpublished, suspended, or a slug that never existed: the contract
 * answers one 404 for all three on purpose, so this screen says the one thing
 * that is true of every one of them - and points at the reference, because a
 * page going dark does not cancel an appointment already taken.
 *
 * <p>It lives in this segment's not-found rather than in the page so the
 * answer carries the status it means. Rendering it from the page returned 200
 * for an address that does not exist, which is what a crawler indexes.
 */
export default function Unavailable() {
  return (
    <>
      <SiteHeader />
      <main id="contenu" className="has-tabbar">
        <section className="section section--lg">
          <div className="page page--narrow" style={{ textAlign: "center" }}>
            <div className="empty">
              <Scene name="storefront" className="scene-ill" />
              <div className="empty__title">Cette page n’est pas disponible</div>
              <p className="empty__body">
                L’établissement que vous cherchez n’est plus visible sur Balaaca. Si vous
                aviez un rendez-vous, il reste valable : retrouvez-le avec votre
                référence.
              </p>
              <div className="empty__actions">
                <Link className="btn btn--primary" href="/bookings">
                  <span className="btn__label--idle">Retrouver ma réservation</span>
                </Link>
                <Link className="btn btn--secondary" href="/">
                  <span className="btn__label--idle">
                    Chercher un autre professionnel
                  </span>
                </Link>
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
