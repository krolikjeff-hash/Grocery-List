/*
 * 9 Deck Scorepad — service worker
 *
 * Game nights happen at other people's houses, where there may be no usable
 * network at all. Firestore's own cache keeps the *data* available once the app
 * is running; this is what lets the app open in the first place.
 *
 * Bump VERSION on every deploy. The old cache is dropped on activate, so a stale
 * shell can never outlive a release.
 */
const VERSION = "9deck-2026-09-07b";
const SHELL = VERSION + "-shell";
const RUNTIME = VERSION + "-runtime";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-32.png",
  "./icon-64.png",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Added one at a time: addAll rejects the whole install if any single file
    // 404s, which would leave the app with no offline shell at all.
    await Promise.all(ASSETS.map(url =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Firestore's transport must never be intercepted — it long-polls and streams,
   and a cache in the middle breaks live sync. Only the things that are genuinely
   static get touched. */
function isFirestoreTransport(url) {
  return url.hostname.endsWith("googleapis.com") && !url.hostname.startsWith("fonts.");
}
function isFont(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}
function isFirebaseLib(url) {
  return url.hostname === "www.gstatic.com" && url.pathname.includes("/firebasejs/");
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (isFirestoreTransport(url)) return;

  // Navigations: try the network so a deploy lands promptly, fall back to the
  // cached shell when there is nothing to reach.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Fonts and the Firebase library: serve from cache, refresh in the background.
  if (isFont(url) || isFirebaseLib(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || network;
    })());
    return;
  }

  // Everything else of ours: cache first.
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        const cache = await caches.open(SHELL);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return Response.error();
      }
    })());
  }
});
