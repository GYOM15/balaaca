import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";

/**
 * The service worker, executed - not read.
 *
 * <p>`pwa.test.mts` compares the worker's declarations against the routes and
 * the manifest. This file runs its handlers, because the failure that matters
 * is a runtime one and no amount of reading the source finds it.
 *
 * <p>A promise handed to `respondWith` that REJECTS does not fall back to the
 * network. The request fails, full stop. And every cache call in a worker can
 * reject: `caches.open` is refused outright by a browser told to block site
 * data, and `cache.put` throws `QuotaExceededError` on a telephone whose
 * storage is full. Since the cached paths are `/_next/static/`, that is every
 * script and every stylesheet this product has - so one unguarded `await
 * cache.put` means a full telephone does not load the application at all, on
 * exactly the device it is built for, with nothing anywhere saying why.
 *
 * <p>So each test below breaks storage in a different way and asserts the
 * network answer still arrives.
 */

const source = readFileSync(
  join(import.meta.dirname, "..", "..", "public", "sw.js"),
  "utf8",
);

/** A cache that works, unless one of its verbs is told to throw. */
function storage({ open = null, put = null, match = null, keys = null } = {}) {
  const entries = new Map();
  const cache = {
    async match(request) {
      if (match) throw match;
      return entries.get(String(request.url ?? request));
    },
    async put(request, response) {
      if (put) throw put;
      entries.set(String(request.url ?? request), response);
    },
    async keys() {
      return [...entries.keys()].map((url) => ({ url }));
    },
    async delete(request) {
      return entries.delete(String(request.url ?? request));
    },
  };
  return {
    entries,
    api: {
      async open() {
        if (open) throw open;
        return cache;
      },
      async keys() {
        if (keys) throw keys;
        return ["balaaca-shell-v0", "balaaca-static-v0", "somebody-elses-cache"];
      },
      async delete() {
        return true;
      },
      async match(request) {
        if (match) throw match;
        return entries.get(String(request.url ?? request));
      },
    },
  };
}

/**
 * Load the worker into a scope of our own and hand back its listeners.
 *
 * <p>`fetch` records what it was asked for and answers a marked response, so a
 * test can tell a network answer from a cached one without guessing.
 */
function boot(cacheApi, { networkFails = false } = {}) {
  const asked: string[] = [];
  const listeners = new Map<string, (event: unknown) => void>();

  const self = {
    location: { origin: "https://balaaca.example" },
    addEventListener(type: string, handler: (event: unknown) => void) {
      listeners.set(type, handler);
    },
    skipWaiting() {},
    clients: { claim() {} },
  };

  const context: Record<string, unknown> = {
    self,
    caches: cacheApi,
    URL,
    Response: { error: () => ({ from: "Response.error" }) },
    Promise,
    async fetch(request: { url: string }) {
      asked.push(request.url);
      if (networkFails) throw new Error("offline");
      return { ok: true, from: "network", clone: () => ({ from: "network" }) };
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "sw.js" });

  return { listeners, asked };
}

/** Fire an event at a listener and return whatever it answered with. */
async function respond(
  listeners: Map<string, (event: unknown) => void>,
  request: unknown,
) {
  let answer: unknown;
  listeners.get("fetch")?.({
    request,
    respondWith(promise: unknown) {
      answer = promise;
    },
  });
  return answer === undefined ? undefined : await answer;
}

const asset = {
  url: "https://balaaca.example/_next/static/chunks/main-abc123.js",
  method: "GET",
  mode: "no-cors",
};

test("a build file is served, and then remembered", async () => {
  const store = storage();
  const { listeners, asked } = boot(store.api);

  const first = await respond(listeners, asset);
  assert.equal((first as { from: string }).from, "network");
  assert.equal(asked.length, 1);

  // Second time it must not touch the network at all.
  const second = await respond(listeners, asset);
  assert.equal((second as { from: string }).from, "network");
  assert.equal(asked.length, 1, "the second request went to the network");
});

test("a telephone whose storage is full still loads the application", async () => {
  // QuotaExceededError, which is what a real browser throws here.
  const store = storage({ put: new Error("QuotaExceededError") });
  const { listeners, asked } = boot(store.api);

  const answer = await respond(listeners, asset);
  assert.equal(
    (answer as { from: string }).from,
    "network",
    "a failed cache write took the script down with it",
  );
  assert.equal(asked.length, 1);
});

test("a browser that refuses storage entirely still loads the application", async () => {
  const store = storage({ open: new Error("SecurityError") });
  const { listeners, asked } = boot(store.api);

  const answer = await respond(listeners, asset);
  assert.equal((answer as { from: string }).from, "network");
  assert.equal(asked.length, 1);
});

test("installing survives a cache that will not open", async () => {
  const store = storage({ open: new Error("SecurityError") });
  const { listeners } = boot(store.api);

  let waited: unknown;
  listeners.get("install")?.({ waitUntil: (promise: unknown) => (waited = promise) });
  // A rejected waitUntil throws the whole worker away, and a worker with no
  // offline page is strictly better than no worker.
  await waited;
});

test("activating survives a cache that will not enumerate", async () => {
  const store = storage({ keys: new Error("SecurityError") });
  const { listeners } = boot(store.api);

  let waited: unknown;
  listeners.get("activate")?.({ waitUntil: (promise: unknown) => (waited = promise) });
  await waited;
});

test("a page is never answered from a cache while the network works", async () => {
  const store = storage();
  const { listeners, asked } = boot(store.api);

  const page = { url: "https://balaaca.example/dashboard", method: "GET", mode: "navigate" };
  await respond(listeners, page);
  await respond(listeners, page);

  // Twice asked, nothing stored. A cached diary shows yesterday's appointments
  // to somebody standing in front of a customer.
  assert.equal(asked.length, 2);
  assert.equal(store.entries.size, 0, "a page of this application was cached");
});

test("the diary falls back to the stored sentence only when the network fails", async () => {
  const store = storage();
  store.entries.set("/hors-ligne", { from: "offline page" });
  const { listeners } = boot(store.api, { networkFails: true });

  const answer = await respond(listeners, {
    url: "https://balaaca.example/dashboard",
    method: "GET",
    mode: "navigate",
  });
  assert.equal((answer as { from: string }).from, "offline page");
});

test("nothing the worker touches is an API call, a POST, or another origin", async () => {
  const store = storage();
  const { listeners } = boot(store.api);

  for (const request of [
    { url: "https://balaaca.example/api/auth/login", method: "GET", mode: "navigate" },
    { url: "https://balaaca.example/media/cover-9f1c.jpg", method: "GET", mode: "no-cors" },
    { url: "https://balaaca.example/dashboard", method: "POST", mode: "navigate" },
    { url: "https://fonts.example/x.woff2", method: "GET", mode: "no-cors" },
  ]) {
    assert.equal(
      await respond(listeners, request),
      undefined,
      `the worker answered for ${request.method} ${request.url}`,
    );
  }
});
