"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { chooseOffer, isIOS, type Offer } from "@/lib/install-offer";

/**
 * The event Chromium fires when it is willing to install this, which is in no
 * specification and in no lib.dom typing.
 *
 * <p>Declared here rather than widened to `any`: `prompt()` and `userChoice`
 * are the only two members this file touches, and naming them means a typo is
 * a compile error instead of a button that does nothing.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Set once the person has said they do not want to be offered this again. */
const DECLINED = "balaaca.install.declined";

/**
 * A button that stays put, and the service worker registration behind it.
 *
 * <p>This was a card in the flow of the agenda, and it did not work - not
 * because it failed, but because nobody reached it. Measured against the real
 * stylesheet at 375x812, its top edge sat 1110 px down the document, behind
 * the readiness alert and the "Publier votre page" panel: two and a bit
 * screens of scrolling past the thing a new provider is being told to do
 * first. It rendered correctly every time and was never seen once.
 *
 * <p>So it is a button that hangs above the tab bar instead, on every screen
 * behind the sign-in, and it does not move when the page scrolls. It is drawn
 * on telephones only, which is where a home screen is; the same offer lives
 * permanently on "Mon compte" for everybody else, rendered by the server,
 * where it cannot depend on this file running at all.
 *
 * <p>It also carries the service worker registration, and that runs before
 * every early return below. A browser will not offer to install anything
 * without one, so registration cannot be conditional on the offer: somebody
 * who has already installed the application, or who asked not to be offered
 * it again, still needs the worker.
 */
export function InstallPrompt() {
  const [offer, setOffer] = useState<Offer>(null);
  const [pending, setPending] = useState<InstallEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  // "Mon compte" carries the same offer permanently, written out in full by
  // the server. A button floating over those very instructions would be one
  // thing said twice on one screen, and it covers the second half of them.
  const onAccount = usePathname() === "/dashboard/compte";

  useEffect(() => {
    // `serviceWorker` is absent from `navigator` outside a secure context, so
    // this is also the guard for plain http on anything but localhost.
    if ("serviceWorker" in navigator) {
      // No await and no `.then` that does anything: a failed registration is
      // not a reason to withhold the dashboard, and there is nothing useful to
      // tell a provider about it.
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    // Already installed: we are running INSIDE the installed window, and a
    // button offering to install it would be absurd. `matchMedia` is the
    // modern signal and `navigator.standalone` is Safari's own, which predates
    // it and is still the only one iOS sets.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    try {
      if (window.localStorage.getItem(DECLINED)) return;
    } catch {
      // Private browsing refuses localStorage entirely. Offering again is a
      // far smaller failure than never offering, so this falls through.
    }

    const capture = (event: Event) => {
      // Preventing the default suppresses Chrome's own mini-infobar, which is
      // the point: the offer is made here, where it can say what installing
      // this is FOR, rather than as a bar at the foot of the screen.
      event.preventDefault();
      setPending(event as InstallEvent);
      setOffer("prompt");
    };
    window.addEventListener("beforeinstallprompt", capture);

    // Installed from the browser's own menu rather than from here.
    const installed = () => {
      setPending(null);
      setGone(true);
    };
    window.addEventListener("appinstalled", installed);

    const browser = {
      ios: isIOS(navigator.userAgent, navigator.maxTouchPoints),
      // A family, not a capability: `onbeforeinstallprompt` is on Window in
      // Chrome on every origin, secure or not. `chooseOffer` is what refuses
      // to act on it alone.
      chromium: "onbeforeinstallprompt" in window,
      secure: window.isSecureContext,
    };

    // iOS is answered on the next tick, everything else after six seconds.
    //
    // The wait is for the event, and only Chromium ever fires it: Chrome does
    // not judge a page installable until a service worker is registered AND
    // controlling it, and on a first visit that worker is still installing
    // while this runs. A short timer lands on the instructions before the
    // event it exists as a fallback FOR has had any chance to fire. `capture`
    // still upgrades to a real button whenever the event arrives, however
    // late. On iOS there is no event to wait for, so waiting would only be a
    // button that is missing for six seconds.
    //
    // Through a timer even at zero, rather than a plain call: setting state in
    // the body of an effect is what `react-hooks/set-state-in-effect` refuses,
    // and it is right to - it is a second render before the first has been
    // committed.
    const settle = window.setTimeout(
      () => setOffer((current) => current ?? chooseOffer({ ...browser, captured: false })),
      browser.ios ? 0 : 6000,
    );

    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
      window.clearTimeout(settle);
    };
  }, []);

  if (gone || onAccount || offer === null) return null;

  const decline = () => {
    try {
      window.localStorage.setItem(DECLINED, "1");
    } catch {
      // Refused. It goes away for this visit, which is what was asked, and
      // "Mon compte" still carries it.
    }
    setGone(true);
  };

  const press = async () => {
    // Android, and the browser handed us the real thing. One tap and the
    // system dialog opens; no instructions can beat that.
    if (offer === "prompt" && pending) {
      setPending(null);
      setGone(true);
      await pending.prompt().catch(() => {});
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className="install-fab hide-lg"
        onClick={press}
        aria-label="Installer Balaaca sur mon écran d’accueil"
      >
        <Icon name="download" size={20} />
      </button>

      {open ? (
        <>
          {/* A plain overlay rather than <dialog>: this island owns its own
              state, and reaching for the page's dialog script would tie a
              button that must work to a file that is replaced wholesale every
              time the design changes. */}
          <button
            type="button"
            className="install-scrim"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          />
          <div
            className="install-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
          >
            <div className="row row--between" style={{ marginBottom: "var(--s-4)" }}>
              <strong id="install-title" className="t-lg">
                Balaaca sur votre écran d’accueil
              </strong>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <p className="t-sm" style={{ color: "var(--text-secondary)" }}>
              Votre agenda s’ouvre alors d’un seul geste, en plein écran, sans passer
              par le navigateur.
            </p>

            {/* Numbered, because this is a sequence somebody performs with a
                telephone in one hand. On iOS it is the only way there is: Apple
                ships no interface for installing a web application, so a button
                that claimed to do it would be a lie. */}
            <ol className="install-steps">
              {(offer === "share"
                ? [
                    <>
                      Appuyez sur <Icon name="share" size={16} /> <strong>Partager</strong>,
                      dans la barre de Safari.
                    </>,
                    <>
                      Faites défiler, puis choisissez{" "}
                      <strong>«&nbsp;Sur l’écran d’accueil&nbsp;»</strong>.
                    </>,
                    <>
                      Appuyez sur <strong>Ajouter</strong>, en haut à droite.
                    </>,
                  ]
                : [
                    <>
                      Ouvrez le menu du navigateur, en haut à droite.
                    </>,
                    <>
                      Choisissez <strong>«&nbsp;Installer l’application&nbsp;»</strong> ou{" "}
                      <strong>«&nbsp;Ajouter à l’écran d’accueil&nbsp;»</strong>.
                    </>,
                  ]
              ).map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>

            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={decline}
              style={{ marginTop: "var(--s-4)" }}
            >
              <span className="btn__label--idle">Ne plus me le proposer</span>
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
