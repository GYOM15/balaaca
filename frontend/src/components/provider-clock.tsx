"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icon";

/**
 * Whose clock the days and the hours on this screen belong to.
 *
 * <p>Every date on the booking flow is computed in the PROVIDER's zone, which
 * is right and is also invisible: a customer reading from another one sees a
 * day strip that starts tomorrow, their own today missing from it, and nothing
 * on the page that says why. That is not hypothetical for this product - a
 * Guinean abroad booking for somebody at home is a customer it expects - and
 * the report was exactly that sentence: the current day does not appear.
 *
 * <p>Nothing at all unless the two zones differ, so the ordinary case - a
 * customer and a salon in one country - reads a page with no extra sentence on
 * it.
 */
export function ProviderClock({ zone }: { zone: string }) {
  const here = useSyncExternalStore(subscribe, browserZone, serverZone);

  if (!here || here === zone) return null;

  return (
    <p className="t-xs" style={{ marginTop: "var(--s-4)" }}>
      <Icon name="clock" size={16} /> Les jours et les horaires sont ceux du
      prestataire, à {city(zone)}. Ils ne suivent pas l’heure de votre
      téléphone.
    </p>
  );
}

/**
 * The store, rather than an effect that sets state. A zone does not change
 * under a page, so there is nothing to subscribe to - what this hook is for
 * here is its THIRD argument: the server renders `null`, the browser renders
 * its own answer, and React is told the two differ on purpose instead of
 * calling it a hydration mismatch on a page somebody is mid-booking on.
 */
function subscribe(): () => void {
  return () => {};
}

function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    // A browser that cannot name its own zone cannot be compared with the
    // salon's either, and a sentence guessed from nothing is worse than none.
    return null;
  }
}

function serverZone(): string | null {
  return null;
}

/** "Africa/Conakry" as somebody says it out loud. */
function city(zone: string): string {
  const last = zone.split("/").pop() ?? zone;
  return last.replace(/_/g, " ");
}
