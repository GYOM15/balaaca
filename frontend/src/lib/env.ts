import "server-only";

/**
 * The environment this server needs, read once and refused loudly.
 *
 * <p>Every value here is a secret or an address, and a missing one has exactly
 * two failure modes: a boot that never happens, or a request that reaches the
 * wrong place with no credential. The first is a five-second fix and the second
 * is a support ticket, so this throws at import time rather than returning
 * undefined into a fetch.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The BFF holds every credential this product has; ` +
        `starting without one would mean answering requests unauthenticated.`,
    );
  }
  return value;
}

export const env = {
  /** Where the Quarkus API lives, on the container network. Never the browser's view. */
  apiBaseUrl: process.env.BALAACA_API_BASE_URL ?? "http://localhost:8080",

  /** The realm's issuer. Discovery hangs off it, so nothing else is hardcoded. */
  issuer: process.env.KEYCLOAK_ISSUER_URL ?? "http://localhost:8180/realms/balaaca",

  clientId: process.env.KEYCLOAK_FRONTEND_CLIENT_ID ?? "balaaca-frontend",

  /** Confidential client. This is why the code exchange happens here. */
  clientSecret: () => required("KEYCLOAK_FRONTEND_CLIENT_SECRET"),

  /** What the browser calls this app. The redirect URI is built from it. */
  publicOrigin: process.env.APP_PUBLIC_ORIGIN ?? "http://localhost:3000",

  /**
   * Seals the session cookie. Rotating it signs everybody out, which is the
   * correct behaviour and the reason it is not derived from anything else.
   */
  sessionSecret: () => required("BALAACA_SESSION_SECRET"),

  /** Cookies are Secure unless this is plainly a developer's machine. */
  get secureCookies(): boolean {
    return !this.publicOrigin.startsWith("http://");
  },
} as const;

export const REDIRECT_PATH = "/api/auth/callback";

export function redirectUri(): string {
  return new URL(REDIRECT_PATH, env.publicOrigin).toString();
}
