const CACHE_NAME = "turf-manager-v2";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons-1.png",
  "/icons-2.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {

  // Google Apps Script calls should always use network
  if (
    event.request.url.includes("script.google.com") ||
    event.request.url.includes("/api/")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {

      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {

          if (
            response &&
            response.status === 200 &&
            response.type === "basic"
          ) {
            const responseClone = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseClone);
              });
          }

          return response;
        })
        .catch(() => {
          return caches.match("/index.html");
        });
    })
  );
});