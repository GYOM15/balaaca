"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

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
 * What the browser in front of us can actually do about installing.
 *
 * <p>Three answers, and they are genuinely different products:
 *
 * <p>`prompt` - Chromium on Android fired `beforeinstallprompt`, we kept it,
 * and a button can open the real install dialog. This is the case the owner
 * asked for, and the only one where a tap is enough.
 *
 * <p>`menu` - Chromium, installable, but the event fired before this component
 * was listening. That happens on a RETURN visit: the service worker is already
 * registered and controlling, so the browser can judge installability during
 * load, before React has hydrated anything. The honest answer is to name the
 * menu item, because the browser's own menu still offers it.
 *
 * <p>`share` - iOS. There is no event, no `prompt()`, and no API of any kind:
 * Apple has never shipped one, and a button that claims to install on iPhone
 * would be a lie. Safari's share sheet carries "Sur l'écran d'accueil" and that
 * is the whole mechanism, so the card explains where it is.
 */
type Offer = "prompt" | "menu" | "share" | null;

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
      // smaller failure than not registering the worker at all, so this falls
      // through rather than returning.
    }

    // The worker first. Nothing below can happen without it, and it is also
    // the half that has to run for somebody who installed months ago and will
    // never see this card again.
    if ("serviceWorker" in navigator) {
      // No await, no .then that does anything: registration failing is not a
      // reason to withhold the rest of the dashboard, and there is nothing
      // useful to tell a provider about it.
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
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

    // Nothing was captured within a moment of mounting, so either this browser
    // never fires the event, or it fired it before we were listening. Both end
    // in instructions rather than a button, and which instructions depends on
    // the platform.
    const ua = navigator.userAgent;
    const iOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS reports itself as a Macintosh and gives itself away by having a
      // touch screen. A real Mac reports maxTouchPoints 0.
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const chromium = "onbeforeinstallprompt" in window;

    const settle = window.setTimeout(() => {
      setOffer((current) => current ?? (iOS ? "share" : chromium ? "menu" : null));
    }, 1500);

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
              ? "Appuyez sur Partager en bas de l’écran, puis sur « Sur l’écran d’accueil »."
              : "Ouvrez le menu du navigateur, puis « Installer l’application »."}
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
