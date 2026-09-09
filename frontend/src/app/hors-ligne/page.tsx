import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/ui";

/**
 * The one page that is stored on the telephone.
 *
 * <p>The service worker caches this at install time and serves it when a
 * navigation fails outright. It exists so the installed application answers
 * something when the network does not: with no service worker at all, a
 * standalone window with no browser chrome shows the browser's own error page,
 * which on Android is a dinosaur and no way back.
 *
 * <p>It is deliberately the ONLY page cached. A stored agenda would show
 * yesterday's appointments to somebody standing in front of a customer, with
 * nothing on the screen saying it was old. This one cannot go stale, because it
 * says nothing about anybody's day.
 *
 * <p>Nothing here reads the API, and nothing here is dynamic - the sentence is
 * the same for everyone, which is what allows it to be stored.
 */
export const metadata: Metadata = {
  title: "Pas de connexion",
  // Never in a search result: this page is an accident of the network, and a
  // customer landing on it from Google would read it as the business being
  // closed.
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="page page--narrow section" id="contenu">
      <EmptyState
        sketch="storefront"
        title="Vous êtes hors ligne"
        body="Votre téléphone n’arrive pas à joindre Balaaca. Vos rendez-vous n’ont rien perdu : dès que la connexion revient, tout réapparaît."
        action={
          // A plain anchor, not next/link: a client-side navigation from a
          // cached page would try to fetch a route payload that is not there.
          // This reloads, which is exactly what somebody pressing it wants.
          <a className="btn btn--primary" href="/dashboard">
            <Icon name="refresh" size={18} />
            <span className="btn__label--idle">Réessayer</span>
          </a>
        }
      />
    </main>
  );
}
