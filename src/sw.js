/* Service worker: keeps the whole app in cache so it opens and works without network.

   Plain JavaScript: it is not bundled with the page. At build time the `pwa` plugin of vite.config.ts replaces
   VERSION and FILES with the build hash and its file list. A new version installs in the background and waits;
   the page tells it to take over ("activate") when the user is not looking (src/ui/pwa.ts).
   Cached pages keep the headers received at install time, security policy included: a changed policy only
   reaches devices with a new version of this file or of the build. */
const VERSION = "__VERSION__";
const FILES = ["__FILES__"];
const CACHE = `bati-${VERSION}`;

self.addEventListener("install", (e) => {
  // "reload": do not reuse an older copy from the HTTP cache.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("bati-") && k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "activate") void self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // One page: any navigation gets index.html (screens are after the "#").
  // ignoreVary: module scripts are requested with an Origin header the cached copy does not have.
  const opts = { cacheName: CACHE, ignoreSearch: true, ignoreVary: true };
  const cached = caches.match(req.mode === "navigate" ? "index.html" : req, opts);
  e.respondWith(cached.then((r) => r || fetch(req)));
});
