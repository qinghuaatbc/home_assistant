// Service Worker — PWA install + Web Push notifications
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  if (!e.data) return
  let payload = { title: 'Home Assistant', body: '', icon: '/favicon.svg' }
  try { payload = { ...payload, ...e.data.json() } } catch {}
  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: '/icon-192.svg',
      vibrate: [200, 100, 200],
      tag: 'ha-alert',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes('/panel') && 'focus' in c) return c.focus()
      }
      if (clients.openWindow) return clients.openWindow('/panel')
    })
  )
})
