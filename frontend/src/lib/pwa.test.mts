import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The install manifest, the root layout, the stylesheet and the service worker
 * all describe one application, and nothing in the build makes them agree.
 *
 * <p>None of these mismatches is an error anywhere. A `theme_color` that has
 * drifted from the viewport's is a status bar in the wrong green. A
 * `background_color` that is not the page's own background is a cream flash on
 * every launch. An icon `src` that no longer exists is a blank tile on a home
 * screen, discovered by whoever installed it. A `start_url` pointing at a route
 * that was renamed is an icon that opens a 404, and the person who finds out is
 * the provider who installed it a month ago.
 *
 * <p>Every check below reads BOTH sides and compares them.
 */

const app = join(import.meta.dirname, "..", "app");
const root = join(import.meta.dirname, "..", "..");

const manifestSource = readFileSync(
  join(app, "manifest.webmanifest", "route.ts"),
  "utf8",
);
const css = readFileSync(join(app, "globals.css"), "utf8");
const layout = readFileSync(join(app, "layout.tsx"), "utf8");
const worker = readFileSync(join(root, "public", "sw.js"), "utf8");

/** One `key: "value"` out of the manifest literal. */
function field(name: string): string {
  const found = manifestSource.match(new RegExp(`^\\s*${name}: "([^"]*)"`, "m"));
  assert.ok(found, `the manifest declares no ${name}`);
  return found[1];
}

/** What a palette token resolves to, following one level of indirection. */
function token(name: string): string {
  const found = css.match(new RegExp(`^\\s*${name}:\\s*(#[0-9A-Fa-f]{6})`, "m"));
  assert.ok(found, `${name} is not declared in globals.css`);
  return found[1].toUpperCase();
}

test("theme_color is the brand green the viewport already declares", () => {
  const declared = field("theme_color").toUpperCase();

  // The root layout paints the browser chrome with this. Two greens a shade
  // apart would show as the address bar and the splash disagreeing.
  const viewport = layout.match(/themeColor:\s*"(#[0-9A-Fa-f]{6})"/);
  assert.ok(viewport, "the root layout declares no viewport themeColor");
  assert.equal(declared, viewport[1].toUpperCase());

  assert.equal(declared, token("--p-green-700"));
});

test("background_color is the page's own background", () => {
  // --bg is var(--p-warm-050). The splash screen is painted before the page
  // exists, so any other value is a visible flash on every launch.
  assert.equal(field("background_color").toUpperCase(), token("--p-warm-050"));
});

test("every icon the manifest names is a file, at the size it claims", () => {
  const icons = [...manifestSource.matchAll(/\{ src: "([^"]+)", sizes: "([^"]+)"/g)];
  assert.ok(icons.length > 0, "the manifest names no icon at all");

  for (const [, src, sizes] of icons) {
    const file = join(root, "public", src.replace(/^\//, ""));
    assert.ok(existsSync(file), `${src} is declared and does not exist`);

    // PNG: the IHDR chunk starts at byte 8, and its width and height are the
    // two big-endian 32-bit integers at 16 and 20. A declared 512x512 that is
    // really 192x192 is upscaled to a blur on a modern telephone.
    const bytes = readFileSync(file);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(`${width}x${height}`, sizes, `${src} is not ${sizes}`);
  }
});

test("start_url and the offline page are routes that exist", () => {
  const start = field("start_url");
  assert.ok(
    existsSync(join(app, start.replace(/^\//, ""), "page.tsx")),
    `start_url ${start} is not a route`,
  );

  // The service worker stores this one page and serves it when a navigation
  // fails. If the route is renamed, cache.add() rejects, the install handler's
  // waitUntil rejects with it, and the worker never activates - so the
  // application silently stops being installable.
  const offline = worker.match(/^const OFFLINE = "([^"]+)"/m);
  assert.ok(offline, "the service worker declares no OFFLINE page");
  assert.ok(
    existsSync(join(app, offline[1].replace(/^\//, ""), "page.tsx")),
    `the service worker caches ${offline[1]}, which is not a route`,
  );

  // Everything the worker touches has to be inside the manifest's scope, or an
  // installed window follows a link and lands back in the browser.
  assert.ok(start.startsWith(field("scope")));
  assert.ok(offline[1].startsWith(field("scope")));
});

test("the manifest is offered to providers only", () => {
  // app/manifest.ts is the idiomatic way to write this and it puts
  // <link rel="manifest"> on every page of the site, public ones included.
  // A customer would then be offered an application that opens a sign-in.
  assert.ok(
    !existsSync(join(app, "manifest.ts")) && !existsSync(join(app, "manifest.js")),
    "app/manifest.ts is back, and with it an install offer on every public page",
  );

  const dashboard = readFileSync(join(app, "dashboard", "layout.tsx"), "utf8");
  assert.match(dashboard, /manifest:\s*"\/manifest\.webmanifest"/);
});

test("the service worker never answers for the API or for media", () => {
  // The whole reason this worker is allowed to exist. A cached diary shows
  // yesterday's appointments to somebody standing in front of a customer, with
  // nothing on the screen saying it is old.
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /pathname\.startsWith\("\/media\/"\)/);

  // Only content-hashed build output is ever put in a cache. Any other
  // cache.put would be storing something that can go stale.
  const puts = [...worker.matchAll(/cache\.put\(/g)];
  assert.equal(puts.length, 1, "the worker writes to a cache somewhere new");
  assert.match(worker, /pathname\.startsWith\("\/_next\/static\/"\)/);
});
