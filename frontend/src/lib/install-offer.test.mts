import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chooseOffer, isIOS } from "./install-offer.ts";

/**
 * What the card is allowed to claim, and the claim that was false.
 *
 * <p>The component decided a Chromium browser would offer an install by
 * reading `"onbeforeinstallprompt" in window`. That attribute has no
 * `[SecureContext]` gate, so it is on Window in Chrome on every origin. It
 * identifies a browser FAMILY and says nothing about installability, and it
 * was read as though it said everything. On an origin with no service worker
 * the card told every provider to open a menu item the browser was not
 * showing.
 */

test("only the captured event justifies a button", () => {
  // The event is the one thing that proves an install is actually on offer.
  assert.equal(
    chooseOffer({ captured: true, ios: false, chromium: true, secure: true }),
    "prompt",
  );
  // And it outranks everything, because it is the only certainty here.
  assert.equal(
    chooseOffer({ captured: true, ios: true, chromium: false, secure: false }),
    "prompt",
  );
});

test("an insecure origin is offered nothing at all", () => {
  // No secure context means no service worker, therefore no installability,
  // therefore no menu item to name. Saying nothing is the only honest answer.
  assert.equal(
    chooseOffer({ captured: false, ios: false, chromium: true, secure: false }),
    null,
  );
});

test("a browser that is not Chromium and not iOS is offered nothing", () => {
  // Firefox and Safari on the desktop install nothing and have no menu item.
  assert.equal(
    chooseOffer({ captured: false, ios: false, chromium: false, secure: true }),
    null,
  );
});

test("iOS is told how, on any origin, because it genuinely works there", () => {
  // Add to Home Screen predates every install specification and does not need
  // a service worker or a secure context.
  assert.equal(
    chooseOffer({ captured: false, ios: true, chromium: false, secure: false }),
    "share",
  );
});

test("every browser on iOS is iOS", () => {
  const iPhoneSafari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
  const iPhoneChrome = `${iPhoneSafari} CriOS/126.0`;
  const iPadOS =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
  const mac = iPadOS;

  assert.equal(isIOS(iPhoneSafari, 5), true);
  // Chrome on iOS is WebKit with a different skin, and reaches the same sheet
  // from a different button - which is why the copy may not name one.
  assert.equal(isIOS(iPhoneChrome, 5), true);
  // iPadOS lies about being a Macintosh; the touch screen gives it away.
  assert.equal(isIOS(iPadOS, 5), true);
  assert.equal(isIOS(mac, 0), false);
  assert.equal(isIOS("Mozilla/5.0 (Linux; Android 14) Chrome/126.0", 5), false);
});

test("the component reads the secure context and never sniffs alone", () => {
  const component = readFileSync(
    join(import.meta.dirname, "..", "components", "install-prompt.tsx"),
    "utf8",
  );

  // The sniff is allowed to exist; deciding on it alone is not.
  assert.match(component, /isSecureContext/);
  assert.ok(
    component.includes("chooseOffer("),
    "the component decides the offer itself again, where nothing can test it",
  );
});
