/* ─── FitZone Service Worker ─────────────────────────────────────────────── */

self.addEventListener("install", (_event) => { self.skipWaiting(); });

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // no-op — required for PWA installability
});

/* ─── Push Notifications ─────────────────────────────────────────────────── */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = { title: "FitZone", body: "", url: "/" };
  try { payload = Object.assign(payload, event.data.json()); } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/fitzone-logo.jpeg",
      badge: "/fitzone-logo.jpeg",
      data: { url: payload.url || "/" },
      vibrate: [200, 100, 200],
      tag: "fitzone-push",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
