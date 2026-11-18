const VERSION = "redline-tarmac-shell-v1";
const SHELL = ["./", "./index.html", "./standings.html", "./rally-control.html", "./data-centre.html", "./newsroom.html", "./favicon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("redline-tarmac-shell-") && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
      return response;
    }).catch(async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match(request)) || (await cache.match("./data-centre.html")) || (await cache.match("./"));
    }));
    return;
  }
  if (url.pathname.endsWith(".json")) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (!cached) throw new Error("No cached data snapshot is available");
      const headers = new Headers(cached.headers);
      headers.set("X-Redline-Cache", "hit");
      return new Response(await cached.arrayBuffer(), { status: cached.status, statusText: cached.statusText, headers });
    }));
    return;
  }
  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
      return response;
    })));
  }
});
