const SHELL_CACHE = "aru-shell-v1";
const MEDIAPIPE_CACHE = "aru-mediapipe-v1";
const ACTIVE_CACHES = new Set([SHELL_CACHE, MEDIAPIPE_CACHE]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add("/offline.html")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !ACTIVE_CACHES.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .catch(async () => (await caches.match("/offline.html")) || Response.error()),
    );
    return;
  }

  // The MediaPipe runtime is 33754629 bytes across the six files in `wasm/`, plus a
  // 3758596-byte `face_landmarker.task`, at URLs with no content hash in them — so they
  // are cached by name and must be, or the capture screen re-downloads them every
  // visit. Cache-first alone meant they were also cached FOREVER: measured on
  // two production builds, a visitor whose cache was warm kept the first copy the same
  // URL ever served — 322044 bytes — while the server was serving 322064, and a
  // `fetch(..., { cache: "no-store" })` from the page did not shake it loose. A deploy
  // that fixes these files would never have reached a returning visitor.
  //
  // Stale-while-revalidate instead: the cached copy answers immediately, and a
  // revalidation runs behind it so the next visit has the new bytes. `next start` serves
  // /public with `Cache-Control: public, max-age=0` plus an ETag, so that revalidation is
  // a conditional request the HTTP cache answers with a 304 when nothing moved — not a
  // 37 MB background download per visit.
  if (url.origin === self.location.origin && url.pathname.startsWith("/vendor/mediapipe/")) {
    event.respondWith(
      caches.open(MEDIAPIPE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const revalidate = fetch(event.request)
          .then(async (response) => {
            // `status === 200`, not `response.ok`: these files are served with
            // `Accept-Ranges: bytes`, and `cache.put` rejects outright on a 206. `.ok`
            // accepts one, so a ranged request for the 11 MB wasm would have thrown
            // inside respondWith and failed the request rather than the write.
            if (response.status === 200) await cache.put(event.request, response.clone()).catch(() => {});
            return response;
          })
          // Offline, or the file gone from this deploy. Never reject: a rejected
          // respondWith is a failed subresource, and for the runtime or the model that
          // is the capture screen dead — the cached copy is exactly what is wanted here.
          .catch(() => undefined);

        if (cached) {
          event.waitUntil(revalidate);
          return cached;
        }
        // Cold cache: there is nothing to serve stale, so wait for the network. A
        // failure here is the same failure the page would have had with no worker at
        // all, which is what Response.error() is.
        return (await revalidate) || Response.error();
      }),
    );
  }
});
