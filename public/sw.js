const SHELL_CACHE = "aru-shell-v1";
const MEDIAPIPE_CACHE = "aru-mediapipe-v1";
const ACTIVE_CACHES = new Set([SHELL_CACHE, MEDIAPIPE_CACHE]);

// `/vendor/mediapipe/<version>/wasm/...` — the runtime directory is named after the
// installed @mediapipe/tasks-vision version (scripts/copy-mediapipe-assets.mjs), so an
// upgrade changes the URL and this cache would otherwise keep the old version's ~34 MB
// next to the new one forever. Two segments are required after `/vendor/mediapipe/`,
// which is what leaves the unversioned `face_landmarker.task` unmatched: it is one
// segment, it is not shipped by the package, and stale-while-revalidate is what keeps
// it current.
const VERSIONED_RUNTIME = /^\/vendor\/mediapipe\/([^/]+)\/.+$/;

function runtimeVersion(pathname) {
  const match = VERSIONED_RUNTIME.exec(pathname);
  return match ? match[1] : null;
}

// Drop every cached runtime file that belongs to some other version, once the visitor
// has asked for this one. The legacy unversioned `/vendor/mediapipe/wasm/...` entries a
// pre-upgrade worker cached match too: their first segment is `wasm`, which is not the
// version being served. Never rejects — it runs under `waitUntil` beside a response
// that has already been decided, and a failed prune is only wasted storage.
function pruneOtherRuntimeVersions(cache, keep) {
  return cache.keys()
    .then((keys) => Promise.all(keys.map((key) => {
      const version = runtimeVersion(new URL(key.url).pathname);
      return version !== null && version !== keep ? cache.delete(key) : undefined;
    })))
    .catch(() => undefined);
}

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
        const version = runtimeVersion(url.pathname);
        if (version !== null) event.waitUntil(pruneOtherRuntimeVersions(cache, version));
        const cached = await cache.match(event.request);
        const revalidate = fetch(event.request)
          .then(async (response) => {
            // `status === 200`, not `response.ok`: these files are served with
            // `Accept-Ranges: bytes`, `.ok` is true for a 206, and `cache.put` rejects
            // outright on one. The `.catch` on the put already keeps that rejection off
            // the response, so the status check is the second of two layers: it skips a
            // write that would fail rather than letting it fail.
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
