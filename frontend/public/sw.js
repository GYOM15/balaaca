/* Balaaca service worker.
 *
 * It exists so a telephone will offer to install this, and it is deliberately
 * the smallest thing that does. What it does NOT cache is the point.
 *
 * A provider's dashboard is a diary. Serving a cached agenda would show
 * yesterday's appointments to somebody standing in front of a customer, and
 * they would have no way to know the screen was lying. An error says "no
 * network"; a stale page says nothing at all. So no page of this application
 * is ever stored, and nothing under /api is ever read from a cache.
 *
 * Two things are cached, and neither can go stale:
 *   - /hors-ligne, one fixed sentence, so an installed window answers something
 *     when the network does not. Without it a standalone window with no browser
 *     chrome shows the browser's own error page, which on Android is a dinosaur
 *     with no way back.
 *   - build output under /_next/static, whose filenames carry a content hash,
 *     so a hit can never be the wrong version. This is what keeps the offline
 *     page legible: its stylesheet is one of those files.
 */

const VERSION = "v1";
const SHELL = `balaaca-shell-${VERSION}`;
const STATIC = `balaaca-static-${VERSION}`;
const OFFLINE = "/hors-ligne";

/*
 * How many hashed files to keep.
 *
 * <p>This is here because a content-hashed cache has no natural end. Every
 * deployment mints new filenames, the old ones match nothing and are never
 * evicted, and the worker's own VERSION does not move - so without a bound the
 * cache grows by a build's worth of JavaScript every time we ship, on a
 * telephone, forever. Bumping VERSION by hand on each deploy would be one more
 * pair of things that must agree with nothing checking that they do.
 *
 * <p>Sixty is roughly two builds of this application's chunks, so the previous
 * deployment survives long enough to serve anyone mid-session and the one
 * before it does not. `cache.keys()` returns insertion order, so the oldest
 * entry is the first one.
 */
const KEEP = 60;

self.addEventListener("install", (event) => {
  // The stored page is best effort. A rejected `waitUntil` throws the whole
  // worker away, so a browser told to block site data - or one that dropped a
  // packet during this single request - would end up with no worker at all
  // rather than with a worker that has no offline page. The second is strictly
  // better: everything else here still works without it.
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(OFFLINE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Every cache this origin holds that is not one of the two current names
  // goes. A worker that accumulates caches across deployments is how a phone
  // ends up serving a build nobody remembers shipping.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("balaaca-") && name !== SHELL && name !== STATIC)
            .map((name) => caches.delete(name)),
        ),
      )
      // Housekeeping, and nothing depends on it having happened. Letting it
      // reject would leave the worker installed and never activated, which is
      // the one state in which it is pure cost.
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

/** Drop the oldest entries once the cache is over its bound. */
async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, keys.length - KEEP)) {
    await cache.delete(request);
  }
}

/**
 * A hashed build file, from the cache if it is there and from the network if it
 * is not - and from the network whatever the cache does.
 *
 * <p>Every cache call in here is allowed to fail, and that is the whole point.
 * `caches.open` is refused outright when a browser is told to block site data,
 * and `cache.put` throws `QuotaExceededError` on a telephone whose storage is
 * full. Either exception rejects the promise handed to `respondWith`, and a
 * rejected `respondWith` does not fall back to the network: the request fails.
 * For these paths that is every script and every stylesheet the application
 * has, so a full telephone would not load the product at all - on exactly the
 * device this is built for, and with nothing in any log to say why.
 *
 * <p>So the cache is an optimisation that is permitted to be absent, and the
 * network answer is returned on every path through this function.
 */
async function fromCacheOrNetwork(request) {
  let cache = null;
  try {
    cache = await caches.open(STATIC);
    const hit = await cache.match(request);
    if (hit) return hit;
  } catch {
    // No storage available. Straight to the network, every time, forever.
    return fetch(request);
  }

  const answer = await fetch(request);
  if (answer.ok) {
    try {
      await cache.put(request, answer.clone());
      await trim(cache);
    } catch {
      // Full, or evicted mid-write. The answer in hand is still good.
    }
  }
  return answer;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only GET. A POST is a booking, a cancellation, a profile being saved:
  // replaying one from a cache would repeat an action somebody took once.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never the API, and never a media file: a provider who replaces their cover
  // must see the new one, and the URL does not change when they do.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;

  // Build output only. Content-hashed, so a hit can never be the wrong version.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fromCacheOrNetwork(request));
    return;
  }

  // Everything else is a page. Network first, always, and the stored sentence
  // only when the network genuinely fails. Nothing is written to a cache here:
  // a page of this application is a page about somebody's day.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE)
          .catch(() => undefined)
          .then((hit) => hit ?? Response.error()),
      ),
    );
  }
});
