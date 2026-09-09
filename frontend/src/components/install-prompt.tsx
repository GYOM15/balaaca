"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { chooseOffer, isIOS, type Offer } from "@/lib/install-offer";

/**
 * The event Chromium fires when it is willing to install this, which is not in
 * any specification and not in any lib.dom typing.
 *
 * <p>Declared here rather than widened to `any`: `prompt()` and `userChoice`
 * are the only two members this file touches, and naming them means a typo is
 * a compile error instead of a button that does nothing.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Set once the person has said no, so the card does not ask again. */
const DECLINED = "balaaca.install.declined";


/**
 * The install card, and the service worker registration that has to precede it.
 *
 * <p>Both live in one component because they are one sequence. A browser will
 * not offer to install anything until a service worker is registered AND a
 * manifest has been parsed; registering somewhere else and prompting here would
 * be two files that have to stay in step with nothing checking that they do.
 *
 * <p>It renders nothing at all when the application is already installed - when
 * it is, we are running INSIDE the installed window and a card offering to
 * install it would be absurd - and nothing when the person has declined.
 *
 * <p>Placed in the dashboard, not on the public site. A customer reaches a
 * business through a link in a conversation and books once; asking them to
 * install something first is a wall in front of the only thing they came for.
 * A provider opens their diary every morning, which is what a home screen icon
 * is for.
 */
export function InstallPrompt() {
  const [offer, setOffer] = useState<Offer>(null);
  const [pending, setPending] = useState<InstallEvent | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The worker first, and BEFORE every early return below. It said so in a
    // comment and did the opposite: registration sat under two `return`s, so
    // the two people who need it most never got it. Somebody who installed the
    // application ran the standalone branch and returned, which meant the
    // INSTALLED window - the one with no browser chrome and no error page of
    // its own - was the only place with no service worker and no offline page.
    // And somebody who pressed "Plus tard" once disabled the worker for good.
    // The card is an offer; the worker is the product.
    //
    // `serviceWorker` is absent from `navigator` outside a secure context, so
    // this is also the guard for plain http on anything but localhost.
    if ("serviceWorker" in navigator) {
      // No await, no `.then` that does anything: a failed registration is not
      // a reason to withhold the rest of the dashboard, and there is nothing
      // useful to tell a provider about it.
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    // Already installed: standalone is the modern signal, navigator.standalone
    // is Safari's own, which predates it and is still the only one iOS sets.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    try {
      if (window.localStorage.getItem(DECLINED)) return;
    } catch {
      // Private browsing refuses localStorage entirely. Asking again is a far
      // smaller failure than saying nothing, so this falls through rather than
      // returning.
    }

    const capture = (event: Event) => {
      // Preventing the default suppresses Chrome's own mini-infobar, which is
      // the point: the offer is made once, inside the page, where it can say
      // what installing this is FOR rather than showing a bar at the bottom of
      // the screen with an icon and a name.
      event.preventDefault();
      setPending(event as InstallEvent);
      setOffer("prompt");
    };
    window.addEventListener("beforeinstallprompt", capture);

    // Installed from the browser's own menu rather than from this card. The
    // card must disappear either way.
    const installed = () => {
      setOffer(null);
      setPending(null);
    };
    window.addEventListener("appinstalled", installed);

    // Nothing captured yet, so fall back to instructions - but only after
    // giving the event a real chance, and only where they would be true.
    //
    // SIX seconds, not one and a half. Chrome does not judge a page
    // installable until a service worker is registered AND controlling it, and
    // on a FIRST visit that worker is still installing while this effect runs.
    // A short timer therefore lands on the fallback every first visit, before
    // the event it was meant to be a fallback FOR has had any chance to fire.
    // A long one costs nothing: `capture` still upgrades the card to a real
    // button whenever the event arrives, however late.
    const browser = {
      ios: isIOS(navigator.userAgent, navigator.maxTouchPoints),
      // A family, not a capability. `chooseOffer` is what refuses to act on it
      // alone, and install-offer.test.mts is what keeps that true.
      chromium: "onbeforeinstallprompt" in window,
      secure: window.isSecureContext,
    };

    const settle = window.setTimeout(() => {
      setOffer((current) => current ?? chooseOffer({ ...browser, captured: false }));
    }, 6000);

    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
      window.clearTimeout(settle);
    };
  }, []);

  if (done || offer === null) return null;

  const decline = () => {
    try {
      window.localStorage.setItem(DECLINED, "1");
    } catch {
      // Refused. The card goes away for this visit, which is what was asked.
    }
    setDone(true);
  };

  return (
    <div className="install" role="region" aria-label="Installer l’application">
      <span className="install__icon">
        <Icon name={offer === "share" ? "share" : "download"} size={20} />
      </span>

      <div className="grow">
        <div className="install__title">Balaaca sur votre écran d’accueil</div>
        <p className="install__body">
          {offer === "prompt"
            ? "Ouvrez votre agenda d’un seul geste, sans passer par le navigateur."
            : offer === "share"
              ? // Not "en bas de l’écran": every browser on iOS reaches this,
                // and they do not all put the control in the same place. Safari
                // on iPhone has it in the bottom bar, Chrome behind its menu,
                // and an iPad in landscape puts the toolbar at the top.
                "Ouvrez le menu de partage, puis « Sur l’écran d’accueil »."
              : // Chrome names it "Installer l’application" when the page is
                // installable and "Ajouter à l’écran d’accueil" when it is not.
                // Both are said, because from here we cannot tell which one the
                // person is looking at.
                "Ouvrez le menu du navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil »."}
        </p>

        <div className="install__actions">
          {offer === "prompt" ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={async () => {
                if (!pending) return;
                // The card goes first. prompt() can only be called once per
                // captured event, and whatever the person answers, this offer
                // is spent.
                setDone(true);
                setPending(null);
                await pending.prompt().catch(() => {});
              }}
            >
              <Icon name="download" size={16} />
              <span className="btn__label--idle">Installer</span>
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost btn--sm" onClick={decline}>
            <span className="btn__label--idle">Plus tard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
