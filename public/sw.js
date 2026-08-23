// Service worker: minimal, install-enabling.
// This is a LIVE real-time tool, so we deliberately do NOT cache app code/data
// (no stale bundles). We only cache the app shell as an offline fallback for
// navigations; everything else goes straight to the network.

const CACHE = 'baynest-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Page loads: network-first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
  }
  // All other GETs: pass through to the network (always fresh).
});

// ── Web Push: show a notification for new leads ──────────────────────────────
self.addEventListener('push', (e) => {
  let d = { title: 'New lead', body: 'A new lead just came in.', url: '/' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) { /* ignore */ }
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: d.url || '/' },
      tag: d.tag || 'baynest-lead',
      renotify: true,
    })
  );
});

// Tapping the notification focuses an open tab or opens the app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
