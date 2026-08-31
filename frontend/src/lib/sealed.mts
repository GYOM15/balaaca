import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "node:crypto";

/**
 * A session, sealed into cookie-sized pieces.
 *
 * <p>Separate from session.ts, which is the Next plumbing, because this half is
 * the half that can be silently wrong: what broke here broke without an error
 * anywhere, and a pure module is a module a test can drive.
 *
 * <p>AES-256-GCM rather than a signature. A signed cookie is readable by anyone
 * who has it - a browser extension, a shared machine, a proxy log - and what is
 * inside is a bearer token for a salon's whole agenda. Encryption here is not
 * caution, it is the difference between a cookie that leaks nothing and one
 * that leaks everything.
 *
 * <p>No library. The primitives are in Node, the format is fixed, and a
 * dependency in the path of every request is a supply chain in the path of
 * every request.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Comfortably under the roughly 4 kB a browser will accept for one cookie. */
export const CHUNK = 3500;

/** More than a session could plausibly need, and a bound on the reads and deletes. */
export const MAX_CHUNKS = 8;

export type Session = {
  accessToken: string;
  refreshToken: string;
  /**
   * Kept for one purpose: it is the `id_token_hint` that makes a sign-out
   * actually end the session AT THE REALM. Without it Keycloak asks "do you
   * want to log out?", nobody answers, its own SSO session survives - and the
   * next visit to the dashboard signs the person straight back in with no
   * password. Verified against a running realm, not assumed.
   */
  idToken: string;
  /** Epoch seconds. Compared against a clock, never trusted from the token. */
  expiresAt: number;
};

/** Derived rather than used raw, so the secret's length and encoding stop mattering. */
function key(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "balaaca-session", "aes-256-gcm", 32));
}

export function seal(session: Session, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/**
 * Null for anything that is not a session this server sealed.
 *
 * <p>A tampered value fails the GCM tag and lands here, and so does one sealed
 * with a rotated secret, and so does a set of pieces that did not all come from
 * the same session. All of them mean "not signed in", which is the only safe
 * reading: guessing at a half-decrypted session is how a forged cookie becomes
 * an authenticated request.
 */
export function unseal(value: string, secret: string): Session | null {
  try {
    const raw = Buffer.from(value, "base64url");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, key(secret), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");

    const parsed: unknown = JSON.parse(plain);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.accessToken === "string" &&
    typeof s.refreshToken === "string" &&
    typeof s.idToken === "string" &&
    typeof s.expiresAt === "number"
  );
}

/** The sealed value cut into pieces that each fit in a cookie. */
export function chunk(sealed: string): string[] {
  const pieces: string[] = [];
  for (let i = 0; i * CHUNK < sealed.length; i++) {
    pieces.push(sealed.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  return pieces;
}
