"use client";

import { EmptyState } from "@/components/ui";

/**
 * Something on the server failed.
 *
 * <p>A client component, and the only one in the tree that is not presentation
 * only - Next requires it, because the retry has to happen in the browser
 * without a navigation.
 *
 * <p>It says the failure is ours and offers the retry, and it says nothing
 * else. `error.message` is a server stack trace in production and is not shown:
 * a reader learns nothing from it and an attacker learns the shape of the
 * stack. The digest IS shown, because it is the one string that ties what the
 * reader saw to a line in the log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="contenu">
      <section className="section section--lg">
        <div className="page page--narrow">
          <EmptyState
            sketch="tools"
            title="Quelque chose n’a pas fonctionné"
            body="Le problème vient de chez nous, pas de vous. Réessayez : la plupart du temps cela suffit."
            action={
              <>
                <button type="button" className="btn btn--primary" onClick={reset}>
                  <span className="btn__label--idle">Réessayer</span>
                </button>
                {/* A hard load, not a soft navigation: the tree that threw is
                    still mounted, and a router push can re-render straight
                    back into it. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a className="btn btn--secondary" href="/">
                  <span className="btn__label--idle">Retour à l’accueil</span>
                </a>
              </>
            }
          />
          {error.digest ? (
            <p className="t-xs" style={{ textAlign: "center", marginTop: "var(--s-6)" }}>
              Référence de l’incident : {error.digest}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
