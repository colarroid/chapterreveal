// Keeps scripture available through network drops (registered in production
// by src/components/offline.tsx).
//
//  - Bibles: served from the browser's copy at once, refreshed in the
//    background. The console also stores each one it loads (bible.ts), so
//    they're here even from before this worker took over.
//  - The app's code (/_next/static): never changes under the same name, so
//    the stored copy is always right.
//  - The console pages and the projector page: from the network when it
//    answers within a few seconds, otherwise the last copy. A reload during
//    an outage still opens the console with the Bible ready.
// Everything else (sign-in, saving, speech) goes to the network as normal.

const BIBLES = "scripture-bibles"; // Same name as BIBLE_CACHE in src/lib/scripture/bible.ts.
const STATIC = "scripture-static-v1";
const PAGES = "scripture-pages-v1";
const KEEP = [BIBLES, STATIC, PAGES];
const PAGE_WAIT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith("scripture-") && !KEEP.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

// Signing out clears the stored pages: they hold the church's details.
self.addEventListener("message", (event) => {
  if (event.data === "sign-out") event.waitUntil(caches.delete(PAGES));
});

const isBible = (url) =>
  (url.origin === self.location.origin && url.pathname.startsWith("/bibles/") && url.pathname.endsWith(".json")) ||
  url.pathname.includes("/storage/v1/object/public/bibles/");

const isOfflinePage = (url) => url.origin === self.location.origin && /^\/(dashboard|songs|screen\/[^/]+)\/?$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isBible(url)) return event.respondWith(staleWhileRevalidate(event, BIBLES, req.url));
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(STATIC, req));
  if (req.mode === "navigate" && isOfflinePage(url)) return event.respondWith(networkThenCache(PAGES, req, url.origin + url.pathname));
});

async function staleWhileRevalidate(event, cacheName, key) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key);
  const fresh = fetch(key, { mode: "cors", credentials: "omit" })
    .then((res) => {
      if (res.ok) void cache.put(key, res.clone()).then(() => dropOldVersions(cache, key));
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return (await fresh) ?? Response.error();
}

// Each new release brings new code files under new names, and the old ones
// are never asked for again. Keep the newest few hundred (a release is well
// under that) so the store doesn't grow release after release.
const STATIC_MAX = 400;

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) void cache.put(req, res.clone()).then(() => trim(cache, STATIC_MAX));
  return res;
}

/** Drops the oldest entries (the store keeps them in the order they were added). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

// An added translation re-uploaded on the admin site gets a new file
// (<id>/v2.json); the old version is never needed again.
async function dropOldVersions(cache, key) {
  const m = key.match(/^(.*\/bibles\/[^/]+\/)v\d+\.json$/);
  if (!m) return;
  for (const k of await cache.keys()) if (k.url !== key && k.url.startsWith(m[1])) await cache.delete(k);
}

async function networkThenCache(cacheName, req, key) {
  const cache = await caches.open(cacheName);
  const network = fetch(req).then((res) => {
    // Only real pages: not a redirect to sign-in, not an error page.
    if (res.ok && !res.redirected) void cache.put(key, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_WAIT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    // Slow network: the stored page now if there is one, otherwise keep waiting.
    return (await cache.match(key)) ?? (await network);
  } catch {
    return (await cache.match(key)) ?? Response.error();
  }
}
