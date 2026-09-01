"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { boot } from "./presentation-script";

/**
 * The presentation layer, and nothing else.
 *
 * <p>The rule this file exists to keep: nothing that touches a value goes to
 * the browser. Every read, every write and every refusal stays on the server,
 * where the session lives. What runs here animates, copies, previews and
 * shows - it reads no API and holds no state that matters.
 */

/**
 * What boot() hands back. Declared here because presentation-script.ts is
 * vendored under ts-nocheck and exports no types of its own.
 */
type Islands = {
  /** Give the reveal observer a subtree it has not seen yet. */
  observe: (scope?: ParentNode | null) => void;
  /** Re-apply every conditional panel from the radio that is checked. */
  syncReveals: (scope?: ParentNode | null) => void;
};

export function Presentation() {
  const islands = useRef<Islands | null>(null);
  /**
   * The screen the islands were last told about. The query counts: a search is
   * a GET on this same path, so `/` and `/?q=tresses` are two screens of the
   * design and were two entries of the mockup's router.
   */
  const shown = useRef<string | null>(null);

  const pathname = usePathname();
  const query = useSearchParams().toString();

  // Once. The listeners are delegated on `document` and the observer is one
  // for the session, so re-running this per render only rebuilt what already
  // worked - and left the previous observer alive, still holding its nodes.
  useEffect(() => {
    const teardown: Array<() => void> = [];
    islands.current = boot(teardown) as Islands;
    return () => {
      islands.current = null;
      teardown.forEach((off) => off());
    };
  }, []);

  // What the mockup's router did on every screen change, minus the router. It
  // is not a second router: it reads the route Next has already taken and does
  // the two things that were the router's and are nobody else's here.
  useEffect(() => {
    const url = query ? `${pathname}?${query}` : pathname;
    // The first pass is the screen boot() has just handled, and StrictMode's
    // second pass in development is the same screen again.
    if (shown.current === null) {
      shown.current = url;
      return;
    }
    if (shown.current === url) return;
    shown.current = url;

    const route = document.querySelector<HTMLElement>(".route");
    // Remove, force a reflow, add: an animation only replays if the class was
    // genuinely absent for a layout, which is why reading offsetWidth is load
    // bearing rather than debris. Skipped for a reader who asked their system
    // to stop moving things, exactly as the mockup skipped it.
    if (route && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      route.classList.remove("anim-fade");
      void route.offsetWidth;
      route.classList.add("anim-fade");
    }

    // Next swaps the tree without reloading, so every [data-reveal] and every
    // conditional panel below is a node the observer has never seen. Left
    // alone they sit at the opacity 0 the design system gives them until they
    // are observed - which is how a page arrived blank below the fold.
    islands.current?.syncReveals();
    islands.current?.observe(document);
  }, [pathname, query]);

  return null;
}
