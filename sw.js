// Cambia la versión del caché cuando modifiques los archivos de la app.
const CACHE = "300dOnEarth-v7";
const ASSETS = [
  "./", "index.html", "styles.css", "app.js", "data-requisitos.js", "data-cities.js", "data-world.js",
  "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png",
];
// Archivos pesados o que casi no cambian: se sirven desde caché y solo se descargan si faltan.
const STATIC = ["data-cities.js", "data-world.js", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

// Con conexión, siempre la versión del servidor (revalidada); sin conexión, la última guardada.
async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-cache" });
    (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match(new URL("index.html", self.registration.scope)));
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const isStatic = STATIC.some((name) => url.pathname.endsWith("/" + name) || url.pathname.endsWith(name));
  event.respondWith(isStatic ? cacheFirst(event.request) : networkFirst(event.request));
});
