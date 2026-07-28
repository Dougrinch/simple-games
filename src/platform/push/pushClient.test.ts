import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FirebaseServices } from '../firebase/client'
import {
  enablePushNotifications,
  getPushNotificationStatus,
  notifyOtherPlayer,
} from './pushClient'

const firebaseMocks = vi.hoisted(() => ({
  services: {
    auth: { currentUser: null },
    database: {},
  } as unknown as FirebaseServices,
  getIdToken: vi.fn(),
  ref: vi.fn(),
  set: vi.fn(),
}))

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>()
  return { ...actual, getIdToken: firebaseMocks.getIdToken }
})

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>()
  return {
    ...actual,
    ref: firebaseMocks.ref,
    set: firebaseMocks.set,
  }
})

vi.mock('../firebase/client', () => ({
  getFirebaseServices: () => firebaseMocks.services,
}))

function installPushGlobals({
  permission = 'default',
  registration,
}: {
  permission?: NotificationPermission
  registration: Partial<ServiceWorkerRegistration>
}) {
  const requestPermission = vi
    .fn<() => Promise<NotificationPermission>>()
    .mockResolvedValue(permission)
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission, requestPermission },
  })
  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    value: class {},
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  })
  return { requestPermission }
}

describe('push client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUSH_WORKER_URL', 'https://push.example/')
    Object.assign(firebaseMocks.services.auth, { currentUser: null })
    firebaseMocks.getIdToken.mockReset()
    firebaseMocks.ref.mockReset().mockImplementation((_database, path) => path)
    firebaseMocks.set.mockReset().mockResolvedValue(undefined)
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reports unsupported and denied browser states', async () => {
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: undefined,
    })
    expect(await getPushNotificationStatus()).toBe('unsupported')

    installPushGlobals({
      permission: 'denied',
      registration: {},
    })
    expect(await getPushNotificationStatus()).toBe('denied')
  })

  it('detects an existing subscription without registering again', async () => {
    const existing = { endpoint: 'https://push.example/device' }
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(existing),
      },
    } as unknown as Partial<ServiceWorkerRegistration>
    installPushGlobals({ permission: 'granted', registration })

    expect(await getPushNotificationStatus()).toBe('enabled')
    expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledWith('/')
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('subscribes on user action and stores the device under the player', async () => {
    const subscription = {
      toJSON: () => ({
        endpoint: 'https://push.example/device',
        expirationTime: null,
        keys: { p256dh: 'key', auth: 'auth' },
      }),
    }
    const subscribe = vi.fn().mockResolvedValue(subscription)
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe,
      },
    } as unknown as Partial<ServiceWorkerRegistration>
    const { requestPermission } = installPushGlobals({
      permission: 'granted',
      registration,
    })
    localStorage.setItem('balda-push-device-id', 'device-1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ publicKey: 'AQID' }),
      ),
    )

    await enablePushNotifications('grinch131')

    expect(requestPermission).toHaveBeenCalledOnce()
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    })
    expect(firebaseMocks.ref).toHaveBeenCalledWith(
      firebaseMocks.services.database,
      'pushSubscriptions/grinch131/device-1',
    )
    expect(firebaseMocks.set).toHaveBeenCalledWith(
      'pushSubscriptions/grinch131/device-1',
      subscription.toJSON(),
    )
  })

  it('reuses an existing subscription and retries its Firebase write', async () => {
    const subscription = {
      toJSON: () => ({
        endpoint: 'https://push.example/existing',
        keys: { p256dh: 'key', auth: 'auth' },
      }),
    }
    const subscribe = vi.fn()
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(subscription),
        subscribe,
      },
    } as unknown as Partial<ServiceWorkerRegistration>
    installPushGlobals({ permission: 'granted', registration })
    localStorage.setItem('balda-push-device-id', 'device-2')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ publicKey: 'AQID' }),
      ),
    )

    await enablePushNotifications('hinhillaa')

    expect(subscribe).not.toHaveBeenCalled()
    expect(firebaseMocks.set).toHaveBeenCalledWith(
      'pushSubscriptions/hinhillaa/device-2',
      subscription.toJSON(),
    )
  })

  it('sends an authenticated empty turn-notification request', async () => {
    const user = { uid: 'uid-grinch131' } as User
    Object.assign(firebaseMocks.services.auth, { currentUser: user })
    firebaseMocks.getIdToken.mockResolvedValue('firebase-token')
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ accepted: true }, { status: 202 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await notifyOtherPlayer()

    expect(firebaseMocks.getIdToken).toHaveBeenCalledWith(user)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://push.example/notifications/turn',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-token',
          'content-type': 'application/json',
        },
        body: '{}',
      },
    )
  })

  it('surfaces denied permission and Worker failures as typed errors', async () => {
    installPushGlobals({ permission: 'denied', registration: {} })

    await expect(
      enablePushNotifications('grinch131'),
    ).rejects.toMatchObject({
      code: 'permission-denied',
    })

    Object.assign(firebaseMocks.services.auth, {
      currentUser: { uid: 'uid' } as User,
    })
    firebaseMocks.getIdToken.mockResolvedValue('token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    )

    await expect(notifyOtherPlayer()).rejects.toMatchObject({
      code: 'worker',
    })
  })
})
