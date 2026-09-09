/**
 * What this browser can honestly be told about installing the application.
 *
 * <p>Its own module, and not a few lines inside the component, for the reason
 * every other file in here is: the component cannot be run by the test runner
 * and this decision is the part that was wrong.
 *
 * <p>The card used to reason from `"onbeforeinstallprompt" in window`. That
 * property is an event-handler IDL attribute Chromium puts on Window with no
 * `[SecureContext]` gate, so it is present in Chrome on ANY origin, including
 * plain http. It says "this is a Chromium browser" and nothing whatever about
 * whether an install is on offer - and it was read as proof that one was. The
 * card then told providers to open a menu item that the browser was not
 * showing, they hunted for it and did not find it.
 */
export type Offer = "prompt" | "menu" | "share" | null;

export type Browser = {
  /** True once `beforeinstallprompt` has been captured. The only real signal. */
  captured: boolean;
  /** An iOS device, whatever browser is painted on top of WebKit. */
  ios: boolean;
  /** A Chromium browser. A family, not a capability. */
  chromium: boolean;
  /** `window.isSecureContext`. No service worker and no install without it. */
  secure: boolean;
};

/**
 * The rule, in the order it has to be read.
 *
 * <p>`prompt` needs the event, because nothing else proves an install is
 * available. Everything below it is instructions, and instructions may only
 * name a control that is actually there.
 *
 * <p>iOS is the one platform where a browser will never fire the event and the
 * capability exists anyway: Add to Home Screen has been in the share sheet
 * since long before any of this was specified, and it works on any origin.
 *
 * <p>Chromium gets instructions only in a secure context. Outside one there is
 * no service worker, therefore no installability, therefore no menu item, and
 * the only honest answer is to say nothing at all.
 */
export function chooseOffer({ captured, ios, chromium, secure }: Browser): Offer {
  if (captured) return "prompt";
  if (ios) return "share";
  if (chromium && secure) return "menu";
  return null;
}

/**
 * An iOS device, from the user agent, which is the only thing that tells us.
 *
 * <p>Every browser on iOS is WebKit with a different skin, and every one of
 * them carries "iPhone" or "iPad" in its user agent - so this matches Chrome
 * and Firefox there too, which is correct: they all reach Add to Home Screen,
 * just not all from the same button. The copy must therefore not name one.
 *
 * <p>iPadOS reports itself as a Macintosh and gives itself away by having a
 * touch screen. A real Mac reports `maxTouchPoints` 0.
 */
export function isIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
