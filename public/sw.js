self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }

  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Балда', {
      body: data.body ?? '',
      icon: new URL('icons/icon-192.png', self.registration.scope).href,
      data: data.data,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    (async () => {
      const requestedUrl = new URL(
        event.notification.data?.url ?? self.registration.scope,
        self.registration.scope,
      )
      const targetUrl = requestedUrl.href.startsWith(self.registration.scope)
        ? requestedUrl.href
        : self.registration.scope
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          if ('navigate' in client) {
            await client.navigate(targetUrl)
          }
          return client.focus()
        }
      }

      return self.clients.openWindow(targetUrl)
    })(),
  )
})
