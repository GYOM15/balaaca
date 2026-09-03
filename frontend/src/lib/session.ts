import "server-only";
import { cookies } from "next/headers";
import { env } from "./env";
import { MAX_CHUNKS, chunk, seal, unseal, type Session } from "./sealed.mts";

export type { Session };

/**
 * The session as a cookie, and nothing about how it is sealed.
 *
 * <p>The tokens live here and nowhere else. No token is ever sent to the
 * browser, embedded in a page, or exposed through a proxy route: the browser
 * holds an opaque value, and this server is the only thing that can open it.
 * That is the whole point of a confidential client, and it is what makes a
 * stolen browser session worth nothing off this origin.
 *
 * <p>The sealing itself is in sealed.mts, which imports nothing from Next and
 * is therefore testable. This module is the plumbing: which cookie, with which
 * flags, read from where.
 */

/**
 * Written in numbered pieces: balaaca_session.0, .1, and so on.
 *
 * <p>Not premature generality - a measurement. A signed-in provider's three
 * tokens are about 3.4 kB of JSON before encryption and about 4.7 kB once
 * sealed and base64url'd, and a browser silently drops any single cookie over
 * roughly 4 kB. It does not warn; the Set-Cookie simply never arrives. What
 * that looks like from outside is a sign-in that loops forever - the callback
 * redirects to the dashboard, the dashboard finds no session, and it starts
 * again - with nothing in any log that names the cause.
 *
 * <p>So the sealed value is cut into pieces that each fit, and the ceiling
 * becomes the total request header size rather than one cookie. If sessions
 * ever need revoking server-side rather than merely expiring, this is where
 * they move into Redis - which the stack already runs - and the cookie becomes
 * an opaque id. They do not need that yet.
 */
const COOKIE_PREFIX = "balaaca_session";

/**
 * How the cookie is set, wherever it is set.
 *
 * <p>Shared by every writer: the proxy renewing a session, the callback
 * creating one. Two of them writing it with different flags would mean a
 * renewed session a later request cannot read, and nothing would report it.
 */
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.secureCookies,
    // Lax and not Strict: the sign-in redirect arrives from Keycloak as a
    // top-level navigation, and Strict would drop the cookie on exactly that
    // request - so the callback would set a session the next page could not see.
    sameSite: "lax" as const,
    path: "/",
    // No maxAge: a session cookie dies with the browser, and the refresh token
    // decides how long a signed-in person stays signed in.
  };
}

/** Anything with a cookie jar: a request in the proxy, or the ambient store. */
export type CookieReader = { get(name: string): { value: string } | undefined };

/** Anything that can set and delete cookies on an outgoing response. */
export type CookieWriter = {
  set(name: string, value: string, options: ReturnType<typeof cookieOptions>): unknown;
  delete(name: string): unknown;
};

export function readSealed(jar: CookieReader): Session | null {
  let sealed = "";
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const piece = jar.get(`${COOKIE_PREFIX}.${i}`)?.value;
    // The pieces are contiguous by construction, so the first gap is the end.
    if (piece === undefined) break;
    sealed += piece;
  }
  return sealed ? unseal(sealed, env.sessionSecret()) : null;
}

export async function readSession(): Promise<Session | null> {
  return readSealed(await cookies());
}

/**
 * Writes the session onto a response, and clears the pieces it did not need.
 *
 * <p>Clearing matters: a shorter session leaving an older, longer one's tail
 * behind would be read back as its own pieces plus somebody else's, fail the
 * GCM tag, and present as a mysteriously invalid session.
 */
export function writeSealed(jar: CookieWriter, session: Session): void {
  const pieces = chunk(seal(session, env.sessionSecret()));
  const options = cookieOptions();

  for (let i = 0; i < MAX_CHUNKS; i++) {
    const piece = pieces[i];
    if (piece !== undefined) {
      jar.set(`${COOKIE_PREFIX}.${i}`, piece, options);
    } else {
      jar.delete(`${COOKIE_PREFIX}.${i}`);
    }
  }
}

export function clearSealed(jar: CookieWriter): void {
  for (let i = 0; i < MAX_CHUNKS; i++) {
    jar.delete(`${COOKIE_PREFIX}.${i}`);
  }
}

/** Whether a session cookie is present at all, without opening it. */
export function hasSessionCookie(jar: CookieReader): boolean {
  return jar.get(`${COOKIE_PREFIX}.0`) !== undefined;
}

/** The short-lived cookie holding the PKCE verifier between authorize and callback. */
export const PKCE_COOKIE = "balaaca_pkce";
