const CACHE_NAME = "radio-portal-v11-chat-notification-invite";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./facebook-share.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function notificationOptions(data = {}) {
  return {
    body: data.body || "Nuevo mensaje en el chat",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: data.tag || ("rpa-chat-" + Date.now()),
    renotify: true,
    vibrate: [180, 80, 180],
    data: { url: data.url || "./?open=chat" }
  };
}

// Avisos solicitados por la página mientras la PWA/web sigue ejecutándose.
self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type !== "SHOW_CHAT_NOTIFICATION") return;
  event.waitUntil(
    self.registration.showNotification(
      data.title || "Radio Portal de Adoración",
      notificationOptions(data)
    )
  );
});

// Preparado para Web Push real desde el servidor. Para que funcione con la app
// totalmente cerrada, hay que crear la suscripción Push del dispositivo y enviar
// el payload desde un backend/Edge Function cuando Supabase inserta un mensaje.
self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "Nuevo mensaje en el chat" };
  }
  event.waitUntil(
    self.registration.showNotification(
      data.title || "Radio Portal de Adoración",
      notificationOptions(data)
    )
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./?open=chat";
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of list) {
      try {
        await client.focus();
        client.postMessage({ type: "OPEN_CHAT" });
        return;
      } catch (_) {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache the live radio stream.
  if (url.protocol === "http:" || url.protocol === "https:") {
    if (url.hostname === "masservidor.net" || url.port === "8280") return;
  }

  // App shell: network first for HTML, cache fallback for offline opening.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Same-origin static assets: cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        });
      })
    );
  }
});
