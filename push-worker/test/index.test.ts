import {
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import webpush from 'web-push'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  handleRequest,
  type FetchFunction,
  type SendNotificationFunction,
  type WorkerDependencies,
} from '../src'

const TEST_APP_URL = 'https://app.example.test/'
const TEST_ORIGIN = 'https://app.example.test'
const TEST_VAPID_PUBLIC_KEY = 'test-vapid-public-key'
const TEST_VAPID_PRIVATE_KEY = 'test-vapid-private-key'

declare module 'cloudflare:workers' {
  interface ProvidedEnv extends Env {}
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

function queuedFetch(
  responses: Response[],
): FetchFunction & { calls: Array<[RequestInfo | URL, RequestInit?]> } {
  const calls: Array<[RequestInfo | URL, RequestInit?]> = []
  const fetcher: FetchFunction = async (input, init) => {
    calls.push([input, init])
    const response = responses.shift()
    if (!response) {
      throw new Error('No queued response.')
    }
    return response
  }

  return Object.assign(fetcher, { calls })
}

function dependencies(
  fetcher: FetchFunction,
  sender: SendNotificationFunction = async () => ({
    statusCode: 201,
    body: '',
    headers: {},
  }),
): WorkerDependencies {
  return { fetch: fetcher, sendNotification: sender }
}

function request(
  path: string,
  init: RequestInit = {},
  origin = TEST_ORIGIN,
): Request {
  const headers = new Headers(init.headers)
  headers.set('origin', origin)
  return new Request(`https://push.example${path}`, { ...init, headers })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<FetchFunction>(async (input) => {
      throw new Error(
        `Unexpected network request in Worker test: ${String(input)}`,
      )
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('push Worker API', () => {
  it('serves the configured Worker entrypoint through Workerd', async () => {
    const response = await exports.default.fetch(
      'https://push.example/vapid-public-key',
      { headers: { origin: TEST_ORIGIN } },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      publicKey: TEST_VAPID_PUBLIC_KEY,
    })
    expect(response.headers.get('access-control-allow-origin')).toBe(
      TEST_ORIGIN,
    )
    expect(env).toMatchObject({
      APP_URL: TEST_APP_URL,
      ALLOWED_ORIGINS: TEST_ORIGIN,
      FIREBASE_API_KEY: 'test-firebase-api-key',
      FIREBASE_DATABASE_URL: 'https://firebase.example.test/',
      VAPID_PUBLIC_KEY: TEST_VAPID_PUBLIC_KEY,
      VAPID_SUBJECT: 'mailto:test@example.test',
      VAPID_PRIVATE_KEY: TEST_VAPID_PRIVATE_KEY,
    })
  })

  it('returns the VAPID public key with exact CORS headers', async () => {
    const ctx = createExecutionContext()
    const response = await handleRequest(
      request('/vapid-public-key'),
      env,
      ctx,
      dependencies(queuedFetch([])),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      publicKey: env.VAPID_PUBLIC_KEY,
    })
    expect(response.headers.get('access-control-allow-origin')).toBe(
      TEST_ORIGIN,
    )
    expect(response.headers.get('vary')).toBe('Origin')
  })

  it('handles preflight and rejects a disallowed browser origin', async () => {
    const preflight = await handleRequest(
      request('/notifications/turn', { method: 'OPTIONS' }),
      env,
      createExecutionContext(),
      dependencies(queuedFetch([])),
    )
    const forbidden = await handleRequest(
      request(
        '/vapid-public-key',
        undefined,
        'https://attacker.example',
      ),
      env,
      createExecutionContext(),
      dependencies(queuedFetch([])),
    )

    expect(preflight.status).toBe(204)
    expect(forbidden.status).toBe(403)
    expect(forbidden.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('returns explicit routing and method errors', async () => {
    const notFound = await handleRequest(
      request('/unknown'),
      env,
      createExecutionContext(),
      dependencies(queuedFetch([])),
    )
    const methodNotAllowed = await handleRequest(
      request('/vapid-public-key', { method: 'POST' }),
      env,
      createExecutionContext(),
      dependencies(queuedFetch([])),
    )

    expect(notFound.status).toBe(404)
    expect(methodNotAllowed.status).toBe(405)
    expect(methodNotAllowed.headers.get('allow')).toBe('GET, OPTIONS')
  })

  it('requires a valid Bearer token', async () => {
    const missing = await handleRequest(
      request('/notifications/turn', { method: 'POST' }),
      env,
      createExecutionContext(),
      dependencies(queuedFetch([])),
    )
    const invalidFetcher = queuedFetch([json({ error: {} }, 400)])
    const invalid = await handleRequest(
      request('/notifications/turn', {
        method: 'POST',
        headers: { authorization: 'Bearer expired-token' },
      }),
      env,
      createExecutionContext(),
      dependencies(invalidFetcher),
    )

    expect(missing.status).toBe(401)
    expect(invalid.status).toBe(401)
    expect(invalidFetcher.calls).toHaveLength(1)
  })

  it('forbids an authenticated account outside the player list', async () => {
    const fetcher = queuedFetch([
      json({ users: [{ email: 'stranger@example.com' }] }),
    ])
    const response = await handleRequest(
      request('/notifications/turn', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      }),
      env,
      createExecutionContext(),
      dependencies(fetcher),
    )

    expect(response.status).toBe(403)
    expect(fetcher.calls).toHaveLength(1)
  })

  it('matches allowed player emails exactly', async () => {
    const fetcher = queuedFetch([
      json({ users: [{ email: 'Grinch131@gmail.com' }] }),
    ])
    const response = await handleRequest(
      request('/notifications/turn', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      }),
      env,
      createExecutionContext(),
      dependencies(fetcher),
    )

    expect(response.status).toBe(403)
    expect(fetcher.calls).toHaveLength(1)
  })

  it('accepts a trusted player and pushes to every valid recipient device', async () => {
    const fetcher = queuedFetch([
      json({ users: [{ email: 'grinch131@gmail.com' }] }),
      json({
        phone: {
          endpoint: 'https://push.example/phone',
          expirationTime: null,
          keys: { p256dh: 'phone-key', auth: 'phone-auth' },
        },
        laptop: {
          endpoint: 'https://push.example/laptop',
          keys: { p256dh: 'laptop-key', auth: 'laptop-auth' },
        },
      }),
    ])
    const sender = vi.fn<SendNotificationFunction>(async () => ({
      statusCode: 201,
      body: '',
      headers: {},
    }))
    const ctx = createExecutionContext()
    const response = await handleRequest(
      request('/notifications/turn', {
        method: 'POST',
        headers: { authorization: 'Bearer valid/token' },
        body: '{}',
      }),
      env,
      ctx,
      dependencies(fetcher, sender),
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true })

    await waitOnExecutionContext(ctx)

    expect(fetcher.calls).toHaveLength(2)
    expect(String(fetcher.calls[1]?.[0])).toContain(
      '/pushSubscriptions/hinhillaa.json?auth=valid%2Ftoken',
    )
    expect(sender).toHaveBeenCalledTimes(2)
    expect(JSON.parse(sender.mock.calls[0]?.[1] ?? '{}')).toMatchObject({
      title: 'Важное сообщение',
      body: 'Вражина сделала свой ход.',
      data: { url: TEST_APP_URL },
    })
    expect(sender.mock.calls[0]?.[2]).toMatchObject({
      urgency: 'high',
      vapidDetails: {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: TEST_VAPID_PRIVATE_KEY,
      },
    })
  })

  it('skips malformed subscriptions and logs expired deliveries safely', async () => {
    const fetcher = queuedFetch([
      json({ users: [{ email: 'hinhillaa@gmail.com' }] }),
      json({
        invalid: { endpoint: 'http://unsafe.example' },
        expired: {
          endpoint: 'https://push.example/expired',
          keys: { p256dh: 'expired-key', auth: 'expired-auth' },
        },
      }),
    ])
    const sender = vi.fn<SendNotificationFunction>(async (subscription) => {
      throw new webpush.WebPushError(
        'Gone',
        410,
        {},
        '',
        subscription.endpoint,
      )
    })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ctx = createExecutionContext()

    const response = await handleRequest(
      request('/notifications/turn', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      }),
      env,
      ctx,
      dependencies(fetcher, sender),
    )
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(202)
    expect(sender).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('"subscriptionExpired":true'),
    )
    expect(warning.mock.calls.flat().join(' ')).not.toContain(
      'https://push.example/expired',
    )
  })

  it('keeps subscription storage errors in background logs', async () => {
    const fetcher = queuedFetch([
      json({ users: [{ email: 'grinch131@gmail.com' }] }),
      json({ error: 'permission denied' }, 401),
    ])
    const sender = vi.fn<SendNotificationFunction>()
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const ctx = createExecutionContext()

    const response = await handleRequest(
      request('/notifications/turn', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      }),
      env,
      ctx,
      dependencies(fetcher, sender),
    )
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(202)
    expect(sender).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('"event":"turn_notification_failed"'),
    )
  })
})
