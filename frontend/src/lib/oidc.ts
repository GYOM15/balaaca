import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env, redirectUri } from "./env";
import type { Session } from "./session";

/**
 * The authorization code flow, done on this server.
 *
 * <p>No client library. The flow is four HTTP calls against a document the
 * realm publishes, and every one of them is in the path of every sign-in - so a
 * dependency here is a dependency in the security path, added to save about
 * eighty lines.
 */

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
};

/**
 * Fetched once and kept for the life of the process.
 *
 * <p>The realm's endpoints do not move while it is running, and re-fetching
 * them on every sign-in would put Keycloak in the path of a page render for no
 * information. A realm that IS reconfigured needs a restart, which is what
 * rotating the client secret already needs.
 */
let discovered: Promise<Discovery> | null = null;

export function discover(): Promise<Discovery> {
  discovered ??= fetch(`${env.issuer}/.well-known/openid-configuration`, {
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) {
      // Cleared, so a realm that was merely slow to boot is retried rather
      // than remembered as broken for the life of the process.
      discovered = null;
      throw new Error(`the realm did not answer discovery: ${response.status}`);
    }
    return (await response.json()) as Discovery;
  });
  return discovered;
}

/**
 * Every API scope, asked for explicitly.
 *
 * <p>They are OPTIONAL scopes in the realm on purpose: a default scope lands in
 * every token for every user, which is how every caller ends up holding every
 * permission. Asking for them here does not grant them - what the caller may
 * actually do is decided by their row in provider_staff, on every request, by
 * the database.
 */
const SCOPES = [
  "openid",
  "dashboard:read",
  "appointments:write",
  "catalog:write",
  "schedule:write",
  "profile:write",
  "staff:write",
].join(" ");

export type Pkce = { verifier: string; challenge: string };

export function pkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export async function authorizeUrl(challenge: string, state: string): Promise<string> {
  const { authorization_endpoint } = await discover();
  const url = new URL(authorization_endpoint);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // PKCE already binds the code to this client; state is what binds the
  // callback to the browser that started it, and it carries where to go next.
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
};

/**
 * @param previousIdToken carried forward on a refresh. A refresh response is
 *                        not obliged to return an id_token, and losing it would
 *                        mean losing the hint that makes sign-out end the
 *                        realm's session - which fails silently, as a person
 *                        who signed out being signed back in
 */
async function token(form: Record<string, string>,
                     previousIdToken = ""): Promise<Session> {
  const { token_endpoint } = await discover();
  const response = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret(),
      ...form,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // The body carries the realm's own description of the failure and is not
    // repeated to the caller: it distinguishes an expired code from a wrong
    // secret, which is a distinction only an operator is entitled to.
    throw new Error(`token endpoint refused: ${response.status}`);
  }

  const body = (await response.json()) as TokenResponse;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    idToken: body.id_token ?? previousIdToken,
    // A minute early, so a token that is valid when this server checks it is
    // still valid when the API validates it a few hundred milliseconds later.
    expiresAt: Math.floor(Date.now() / 1000) + body.expires_in - 60,
  };
}

export function exchange(code: string, verifier: string): Promise<Session> {
  return token({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
}

export function refresh(session: Session): Promise<Session> {
  return token(
    { grant_type: "refresh_token", refresh_token: session.refreshToken },
    session.idToken,
  );
}

/**
 * Where to send the browser to end the session at the realm.
 *
 * <p>The id_token_hint is what makes this a sign-out rather than a question.
 * Without it Keycloak renders "Do you want to log out?", the person closes the
 * tab, its SSO session survives - and the next visit to the dashboard is
 * answered with a fresh code and no password. So the local cookie is gone and
 * the person is still signed in, which is the worst of both.
 */
export async function endSessionUrl(idToken: string): Promise<string> {
  const { end_session_endpoint } = await discover();
  const url = new URL(end_session_endpoint);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("id_token_hint", idToken);
  url.searchParams.set("post_logout_redirect_uri", env.publicOrigin);
  return url.toString();
}
