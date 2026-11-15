/**
 * Minimal service worker for the Ledgerly PWA.
 *
 * - Cache-first for versioned same-origin static assets (/_next/static, icons,
 *   manifest, apple touch icon). These URLs are content-hashed, so caching
 *   them is safe.
 * - Network-first for navigations, falling back to the cached app shell when
 *   offline.
 * - /api/* requests (including /api/auth/*) are never intercepted or cached,
 *   so the sign-in flow and sheet reads/writes always go to the network.
 */
const CACHE = "ledgerly-static-v1";
const SHELL = ["/", "/icons/icon-192.png", "/icons/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {
        // Precache is best-effort; a failed install must not block the app.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin requests, and never intercept API traffic
  // (auth, sheet reads/writes) — those always go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for versioned static assets.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then(
          (cached) =>
            cached ??
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
        )
      )
    );
    return;
  }

  // Everything else same-origin: straight to the network, no caching.
  event.respondWith(fetch(request));
});
