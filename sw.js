/*
 * Grocery-List — service worker kill switch
 *
 * Why this file exists: a service worker from another app was briefly published
 * at this path. Any browser that loaded the site during that window registered it,
 * and it will keep serving that other app's cached pages from this URL even after
 * the correct index.html is restored. Deleting sw.js from the repo does NOT fix
 * that — an already-registered worker keeps running, and a 404 on its own script
 * does not reliably remove it.
 *
 * So instead of deleting it, replace it with this. A browser checks for a new
 * version of its service worker on navigation; it will see these bytes, install
 * them, and this worker will then delete every cache and unregister itself,
 * handing control back to the network.
 *
 * Leave it in place for a couple of weeks so every device has had a chance to
 * visit, then delete the file.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach(client => client.navigate(client.url));
  })());
});

// Never serve anything from cache in the meantime.
self.addEventListener("fetch", () => {});
