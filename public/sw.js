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

  if (url.origin === self.location.origin && url.pathname.startsWith("/vendor/mediapipe/")) {
    event.respondWith(
      caches.open(MEDIAPIPE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
  }
});
