import "server-only";
import { env } from "./env";
import { readSession } from "./session";

/**
 * Every call this application makes to the business API.
 *
 * <p>It runs on the server, always. There is no proxy route and no client-side
 * fetch, so the access token has nowhere to leak to: a page is rendered here
 * with the data already in it, and a form posts to a server action that calls
 * this. What the browser holds is one opaque cookie.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The stable code from the API's closed catalogue, when it sent one. */
    readonly code: string | null,
    readonly detail: string | null,
  ) {
    super(`${status} ${code ?? "?"}`);
  }
}

type Options = {
  method?: string;
  body?: unknown;
  /** Sent only where the contract requires it, which is booking. */
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | undefined | string[]>;
};

/**
 * A call as a signed-in member of a business.
 *
 * <p>The tenant is never a parameter. The API resolves it from the token's
 * subject through the database on every request, so there is nothing here that
 * could name the wrong salon - and nothing a page could pass in by mistake.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const session = await currentSession();
  if (!session) {
    throw new ApiError(401, "UNAUTHENTICATED", "no session");
  }
  return call<T>(path, options, session.accessToken);
}

/** A call with no session: the directory, a provider's page, a customer's booking. */
export function publicApi<T>(path: string, options: Options = {}): Promise<T> {
  return call<T>(path, options, null);
}

async function call<T>(path: string, options: Options, accessToken: string | null): Promise<T> {
  const url = new URL(path, env.apiBaseUrl);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value === undefined) continue;
    // Repeated rather than joined: the contract's multi-value parameters are
    // arrays, and a comma-separated string would arrive as one long value.
    for (const one of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(name, String(one));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // Never cached. Every page here reads a diary or a live slot list, and a
    // cached one is either stale or somebody else's.
    cache: "no-store",
  });

  if (!response.ok) throw await problemFrom(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * The API's RFC 7807 body, or the status alone when it sent something else.
 *
 * <p>The code is what callers branch on; the detail is human text that may
 * change. Nothing here invents a code the catalogue does not have.
 */
async function problemFrom(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { code?: string; detail?: string };
    return new ApiError(response.status, body.code ?? null, body.detail ?? null);
  } catch {
    return new ApiError(response.status, null, null);
  }
}

/**
 * The session, as the proxy left it.
 *
 * <p>Nothing is refreshed here, and that is deliberate rather than an
 * omission. A page render may read cookies and may not write them, so a
 * refresh at this point could obtain a new token and then throw on storing it -
 * which is exactly what happened: the whole dashboard answered 500 the first
 * time an access token aged out, about an hour after signing in. Renewal
 * belongs to proxy.ts, which runs before the response begins and can set the
 * cookie on it.
 *
 * <p>An expired session reaching this point therefore means a path that calls
 * the API is not covered by the proxy's matcher, which is a routing mistake
 * and not a signed-out visitor.
 */
async function currentSession() {
  const session = await readSession();
  if (!session) return null;
  return session.expiresAt > Math.floor(Date.now() / 1000) ? session : null;
}

/** Whether anybody is signed in, without making a call to find out. */
export async function isSignedIn(): Promise<boolean> {
  return (await readSession()) !== null;
}
