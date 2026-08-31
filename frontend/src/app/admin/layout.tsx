import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ActionButton, Button, EmptyState, Wordmark } from "@/components/ui";
import { ApiError, api, isSignedIn } from "@/lib/api";
import type { ProviderReportPage } from "@/lib/types";

/** A complaints queue. Cached, it would show one already answered. */
export const dynamic = "force-dynamic";

/**
 * The platform's own console, and the door to it.
 *
 * <p>The guard is here rather than on the page, for the same reason the
 * dashboard's is: a screen added under this path without one is the kind of
 * omission nobody notices until it is public, and nothing under /admin may be
 * read by anybody but the operator.
 *
 * <p>It costs one call, because `admin:moderation` lives on the token and no
 * operation this application already reads reports whether the caller holds it.
 * Asking the cheapest admin operation is the only way to know, so the queue is
 * asked for a single row and the answer thrown away - once, at the door,
 * instead of once per screen added behind it.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isSignedIn())) redirect("/api/auth/login?next=/admin");

  try {
    await api<ProviderReportPage>("/v1/admin/reports", { query: { limit: 1 } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    // An aged session arrives here rather than at a sign-in, because /admin is
    // outside the proxy's matcher and so nothing renewed the token on the way
    // in. Sending them to sign in is what the proxy would have done.
    if (error.status === 401) redirect("/api/auth/login?next=/admin");

    // A provider who found the URL. They are told, rather than shown a 500
    // that reads as "the product is broken" when the answer was simply no.
    if (error.status === 403) {
      return (
        <Shell>
          <div className="container container--booking section">
            <EmptyState
              sketch="storefront"
              title="Cette console est réservée à l’équipe Balaaca"
              body="Votre compte n’a pas le droit de modération. Si vous cherchez votre activité, tout se passe dans votre tableau de bord."
              action={
                <Button
                  label="Ouvrir mon tableau de bord"
                  variant="primary"
                  href="/dashboard"
                  iconEnd="arrow-right"
                />
              }
            />
          </div>
        </Shell>
      );
    }
    throw error;
  }

  return <Shell>{children}</Shell>;
}

/**
 * Deliberately not the dashboard's sidebar.
 *
 * <p>That navigation exists to move between a salon's rooms. This console has
 * one screen, and a sidebar holding a single entry would promise rooms that do
 * not exist.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <header className="site-head">
        <Wordmark href="/admin" size={26} />
        <span className="grow t-caption t-dim">Modération</span>
        {/* POST, because a sign-out on GET is triggered by any image tag. */}
        <form method="post" action="/api/auth/logout">
          <ActionButton
            label="Se déconnecter"
            variant="ghost"
            size="sm"
            type="submit"
            icon="lock"
          />
        </form>
      </header>
      <main className="site__main" id="contenu">
        {children}
      </main>
    </div>
  );
}
