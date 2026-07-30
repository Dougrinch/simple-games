/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import { expect, it, vi } from 'vitest'

type ServiceWorkerEventHandler = (event: unknown) => void

function eventHandler<Event>(
  listeners: Map<string, ServiceWorkerEventHandler>,
  type: string,
): (event: Event) => void {
  const listener = listeners.get(type)
  expect(listener).toBeDefined()
  return listener as (event: Event) => void
}

it('shows push payloads and keeps notification clicks inside the app', async () => {
  const scopeUrl = 'https://app.example.test/simple-games/'
  const listeners = new Map<string, ServiceWorkerEventHandler>()
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const navigate = vi.fn().mockResolvedValue(undefined)
  const focus = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn()
  const matchAll = vi.fn().mockResolvedValue([
    {
      url: `${scopeUrl}game`,
      navigate,
      focus,
    },
  ])
  const openWindow = vi.fn().mockResolvedValue(undefined)
  const serviceWorkerScope = {
    addEventListener: (
      type: string,
      listener: ServiceWorkerEventHandler,
    ) => {
      listeners.set(type, listener)
    },
    registration: {
      scope: scopeUrl,
      showNotification,
    },
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll,
      openWindow,
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
  }
  const source = await readFile(
    resolve(process.cwd(), 'public/sw.js'),
    'utf8',
  )

  runInNewContext(source, { self: serviceWorkerScope, URL })

  let pushCompletion: Promise<unknown> | undefined
  const payload = {
    title: 'Балда',
    body: 'Теперь твоя очередь.',
    data: { url: `${scopeUrl}game` },
  }
  eventHandler<{
    data: { json: () => typeof payload }
    waitUntil: (promise: Promise<unknown>) => void
  }>(listeners, 'push')({
    data: { json: () => payload },
    waitUntil: (promise) => {
      pushCompletion = promise
    },
  })
  await pushCompletion

  expect(showNotification).toHaveBeenCalledWith('Балда', {
    body: 'Теперь твоя очередь.',
    icon: `${scopeUrl}icons/icon-192.png`,
    data: payload.data,
  })

  let clickCompletion: Promise<unknown> | undefined
  eventHandler<{
    notification: {
      close: () => void
      data: { url: string }
    }
    waitUntil: (promise: Promise<unknown>) => void
  }>(listeners, 'notificationclick')({
    notification: {
      close,
      data: { url: 'https://attacker.example/phishing' },
    },
    waitUntil: (promise) => {
      clickCompletion = promise
    },
  })
  await clickCompletion

  expect(close).toHaveBeenCalledOnce()
  expect(matchAll).toHaveBeenCalledWith({
    type: 'window',
    includeUncontrolled: true,
  })
  expect(navigate).toHaveBeenCalledWith(scopeUrl)
  expect(focus).toHaveBeenCalledOnce()
  expect(openWindow).not.toHaveBeenCalled()
})
