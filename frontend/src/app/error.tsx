"use client";

import Link from "next/link";
import { Icon, Scene } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

/**
 * Something on the server failed.
 *
 * <p>A client component, and the only one in the tree that is not presentation
 * only - Next requires it, because the retry has to happen in the browser
 * without a navigation.
 *
 * <p>Built as the not-found screen is built, because it is the same screen with
 * a different sentence: a dead end that carries the header, the footer and the
 * bottom bar is still a page somebody can leave from.
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
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section className="section section--lg">
          <div className="page page--narrow">
            <div className="empty">
              <Scene name="tools" className="scene-ill" />
              <div className="empty__title">Quelque chose n’a pas fonctionné</div>
              <p className="empty__body">
                Le problème vient de chez nous, pas de vous. Réessayez : la plupart du
                temps cela suffit.
              </p>
              <div className="empty__actions">
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
              </div>
            </div>
            {error.digest ? (
              <p className="t-xs" style={{ textAlign: "center", marginTop: "var(--s-6)" }}>
                Référence de l’incident : {error.digest}
              </p>
            ) : null}
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar />
    </>
  );
}

