"use client";

import { useEffect } from "react";
import { boot } from "./presentation-script";

/**
 * The presentation layer, and nothing else.
 *
 * <p>The rule this file exists to keep: nothing that touches a value goes to
 * the browser. Every read, every write and every refusal stays on the server,
 * where the session lives. What runs here animates, copies, previews and
 * shows - it reads no API and holds no state that matters.
 *
 * <p>Re-run on every navigation, because Next replaces the tree without
 * reloading and the observers would otherwise still be watching nodes that
 * have gone. Everything it registers is handed back for teardown.
 */
export function Presentation() {
  useEffect(() => {
    const teardown: Array<() => void> = [];
    boot(teardown);
    return () => teardown.forEach((off) => off());
  });

  return null;
}
