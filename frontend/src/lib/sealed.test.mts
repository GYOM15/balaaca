import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK, chunk, seal, unseal, type Session } from "./sealed.mts";

/**
 * The session cookie, where it can actually be wrong.
 *
 * <p>This module is what broke, and it broke without an error anywhere: a
 * sealed session grew past what a browser will hold in one cookie, the
 * Set-Cookie was dropped in silence, and the symptom was a sign-in that looped
 * forever with nothing in any log naming the cause. So the size case is a test,
 * not a comment.
 */

const SECRET = "a-local-test-secret-that-is-long-enough-to-be-a-key";

function aSession(tokenSize: number): Session {
  return {
    accessToken: "a".repeat(tokenSize),
    refreshToken: "r".repeat(tokenSize),
    idToken: "i".repeat(tokenSize),
    expiresAt: 1_800_000_000,
  };
}

test("a sealed session opens back into the same session", () => {
  const session = aSession(40);
  assert.deepEqual(unseal(seal(session, SECRET), SECRET), session);
});

test("a real session is too big for one cookie and is cut into pieces", () => {
  // Measured against a running realm: about 1.5 kB of access token, 0.8 kB of
  // refresh token and 1.1 kB of id token, which seals to roughly 4.7 kB - past
  // the ~4 kB a browser will accept for a single cookie.
  const pieces = chunk(seal(aSession(1_200), SECRET));

  assert.ok(pieces.length > 1, "a session this size has to span more than one cookie");
  for (const piece of pieces) {
    assert.ok(piece.length <= CHUNK, `a piece of ${piece.length} would be dropped`);
  }
  // And the pieces are the value: joined in order they open again.
  assert.equal(unseal(pieces.join(""), SECRET)?.expiresAt, 1_800_000_000);
});

test("a small session still fits in one piece", () => {
  assert.equal(chunk(seal(aSession(10), SECRET)).length, 1);
});

test("anything this server did not seal is not a session", () => {
  const sealed = seal(aSession(40), SECRET);

  // A rotated secret. Signing everybody out is the correct behaviour.
  assert.equal(unseal(sealed, "a-different-secret-entirely-and-long-enough"), null);
  // A tampered value fails the GCM tag rather than half-decoding.
  assert.equal(unseal(sealed.slice(0, -4) + "AAAA", SECRET), null);
  // A truncated set of pieces - what a dropped cookie leaves behind.
  assert.equal(unseal(sealed.slice(0, sealed.length - 20), SECRET), null);
  assert.equal(unseal("not-base64url-at-all!!", SECRET), null);
});

test("a session missing a field is not a session", () => {
  // The id token was added later. A cookie sealed before it carries three of
  // the four fields, and reading it as a session would mean a sign-out that
  // cannot end the realm's session - so it is refused and the person signs in
  // again, once.
  const incomplete = { accessToken: "a", refreshToken: "r", expiresAt: 1 } as unknown as Session;
  assert.equal(unseal(seal(incomplete, SECRET), SECRET), null);
});
