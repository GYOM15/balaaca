"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: a cookie emits no event, and signing in navigates. */
const never = () => () => {};

/** A cookie named exactly this, at a boundary, so a longer name cannot match. */
const read = () => /(^|;\s*)balaaca_signed_in=1(;|$)/.test(document.cookie);

/** What the server renders, every time. See the note on hydration above. */
const signedOut = () => false;

/**
 * The header's way back in, worded for whoever is reading it.
 *
 * <p>A client component, and that is the whole design. Deciding this on the
 * server means reading a cookie in the root layout, which makes every page
 * dynamic - and the marketing pages are static so that Cloudflare can cache
 * them, which is what makes this bearable from a Raspberry Pi on a domestic
 * connection. Threading a prop through the seventeen pages that draw the header
 * was the other option, and the one that gets forgotten on the eighteenth.
 *
 * <p>It reads {@code balaaca_signed_in}, which carries one bit and no identity.
 * The link is the same either way: {@code /dashboard} sends a stranger to the
 * sign-in and a member to their diary, so a wrong guess here costs a word, not
 * an access - and forging the cookie grants nothing, because every decision
 * that matters is taken on the server against the sealed session.
 *
 * <p>It renders the signed-out wording first, always. The server has no cookie
 * to read at this point, so anything else would be two different trees on the
 * server and in the browser, which React reports as a hydration error on every
 * page of the site.
 */
export function SignedInLabel({ out, in: whenIn }: { out: string; in: string }) {
  // useSyncExternalStore and not an effect: it takes the server's snapshot and
  // the browser's as two declared values, so React knows the first render is
  // meant to differ and reconciles it instead of reporting a mismatch.
  const signedIn = useSyncExternalStore(never, read, signedOut);
  return <>{signedIn ? whenIn : out}</>;
}
