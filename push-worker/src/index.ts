import webpush from 'web-push'
import type {
  PushSubscription,
  RequestOptions,
  SendResult,
} from 'web-push'

const PLAYER_BY_EMAIL = {
  'grinch131@gmail.com': 'grinch131',
  'hinhillaa@gmail.com': 'hinhillaa',
} as const

type PlayerId = (typeof PLAYER_BY_EMAIL)[keyof typeof PLAYER_BY_EMAIL]

export type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type SendNotificationFunction = (
  subscription: PushSubscription,
  payload: string,
  options: RequestOptions,
) => Promise<SendResult>

export interface WorkerDependencies {
  fetch: FetchFunction
  sendNotification: SendNotificationFunction
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function rawRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function allowedOrigin(request: Request, env: Env): string | null {
  const requestOrigin = request.headers.get('origin')
  if (!requestOrigin) {
    return null
  }

  const origins = env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (!origins.includes(requestOrigin)) {
    throw new HttpError(403, 'Origin is not allowed.')
  }

  return requestOrigin
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  })

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
  }

  return headers
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  extraHeaders?: HeadersInit,
): Response {
  const headers = corsHeaders(origin)
  headers.set('Content-Type', 'application/json; charset=utf-8')

  if (extraHeaders) {
    for (const [name, value] of new Headers(extraHeaders)) {
      headers.set(name, value)
    }
  }

  return Response.json(body, { status, headers })
}

function logInfo(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...details }))
}

function logWarning(
  event: string,
  details: Record<string, unknown> = {},
): void {
  console.warn(JSON.stringify({ event, ...details }))
}

function logError(event: string, details: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ event, ...details }))
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer ([^\s]+)$/u)

  if (!match?.[1]) {
    throw new HttpError(401, 'A Firebase ID token is required.')
  }

  return match[1]
}

async function authenticatePlayer(
  idToken: string,
  env: Env,
  dependencies: WorkerDependencies,
): Promise<PlayerId> {
  let response: Response

  try {
    const authBaseUrl = env.FIREBASE_AUTH_BASE_URL.replace(/\/$/u, '')
    response = await dependencies.fetch(
      `${authBaseUrl}/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    )
  } catch {
    throw new HttpError(502, 'Firebase Authentication is unavailable.')
  }

  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) {
      throw new HttpError(401, 'The Firebase ID token is invalid.')
    }
    throw new HttpError(502, 'Firebase Authentication is unavailable.')
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new HttpError(502, 'Firebase Authentication returned invalid data.')
  }

  const account = rawRecord(data)
  const users = account?.users
  const user =
    Array.isArray(users) && users.length === 1 ? rawRecord(users[0]) : null
  const email =
    typeof user?.email === 'string'
      ? user.email.trim()
      : ''
  const playerId =
    email in PLAYER_BY_EMAIL
      ? PLAYER_BY_EMAIL[email as keyof typeof PLAYER_BY_EMAIL]
      : null

  if (!playerId) {
    throw new HttpError(403, 'This Firebase account is not an allowed player.')
  }

  return playerId
}

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === 'grinch131' ? 'hinhillaa' : 'grinch131'
}

function parseSubscription(value: unknown): PushSubscription | null {
  const subscription = rawRecord(value)
  const keys = rawRecord(subscription?.keys)
  const endpoint =
    typeof subscription?.endpoint === 'string'
      ? subscription.endpoint.trim()
      : ''
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : ''
  const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : ''

  if (!endpoint || !p256dh || !auth) {
    return null
  }

  try {
    if (new URL(endpoint).protocol !== 'https:') {
      return null
    }
  } catch {
    return null
  }

  return {
    endpoint,
    expirationTime:
      typeof subscription?.expirationTime === 'number'
        ? subscription.expirationTime
        : null,
    keys: { p256dh, auth },
  }
}

async function readSubscriptions(
  recipientPlayerId: PlayerId,
  idToken: string,
  env: Env,
  dependencies: WorkerDependencies,
): Promise<PushSubscription[]> {
  const databaseUrl = new URL(
    `pushSubscriptions/${recipientPlayerId}.json`,
    env.FIREBASE_DATABASE_URL.endsWith('/')
      ? env.FIREBASE_DATABASE_URL
      : `${env.FIREBASE_DATABASE_URL}/`,
  )
  databaseUrl.searchParams.set('auth', idToken)

  const databaseNamespace = env.FIREBASE_DATABASE_NAMESPACE.trim()
  if (databaseNamespace) {
    databaseUrl.searchParams.set('ns', databaseNamespace)
  }

  const response = await dependencies.fetch(databaseUrl)

  if (!response.ok) {
    throw new HttpError(
      502,
      `Firebase Realtime Database returned ${response.status}.`,
    )
  }

  const data: unknown = await response.json()
  if (data === null) {
    return []
  }

  const storedSubscriptions = rawRecord(data)
  if (!storedSubscriptions) {
    throw new HttpError(502, 'Stored push subscriptions are invalid.')
  }

  const subscriptions: PushSubscription[] = []

  for (const value of Object.values(storedSubscriptions)) {
    const parsed = parseSubscription(value)
    if (parsed) {
      subscriptions.push(parsed)
    } else {
      logWarning('push_subscription_invalid', { recipientPlayerId })
    }
  }

  return subscriptions
}

function pushErrorStatus(error: unknown): number | null {
  return error instanceof webpush.WebPushError ? error.statusCode : null
}

async function deliverTurnNotifications(
  recipientPlayerId: PlayerId,
  idToken: string,
  env: Env,
  dependencies: WorkerDependencies,
): Promise<void> {
  try {
    const subscriptions = await readSubscriptions(
      recipientPlayerId,
      idToken,
      env,
      dependencies,
    )
    const payload = JSON.stringify({
      title: 'Балда',
      body: 'Соперник сделал ход. Теперь твоя очередь.',
      data: { url: env.APP_URL },
    })
    let sent = 0
    let failed = 0

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await dependencies.sendNotification(subscription, payload, {
            TTL: 60 * 60,
            urgency: 'high',
            vapidDetails: {
              subject: env.VAPID_SUBJECT,
              publicKey: env.VAPID_PUBLIC_KEY,
              privateKey: env.VAPID_PRIVATE_KEY,
            },
          })
          sent += 1
        } catch (error) {
          failed += 1
          const statusCode = pushErrorStatus(error)
          logWarning('push_delivery_failed', {
            recipientPlayerId,
            statusCode,
            subscriptionExpired: statusCode === 404 || statusCode === 410,
          })
        }
      }),
    )

    logInfo('turn_notification_completed', {
      recipientPlayerId,
      subscriptions: subscriptions.length,
      sent,
      failed,
    })
  } catch (error) {
    logError('turn_notification_failed', {
      recipientPlayerId,
      statusCode: error instanceof HttpError ? error.status : null,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
  }
}

const defaultDependencies: WorkerDependencies = {
  fetch: (input, init) => fetch(input, init),
  sendNotification: (subscription, payload, options) =>
    webpush.sendNotification(subscription, payload, options),
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  dependencies: WorkerDependencies = defaultDependencies,
): Promise<Response> {
  let origin: string | null = null

  try {
    origin = allowedOrigin(request, env)
    const url = new URL(request.url)
    const isPublicKeyRoute = url.pathname === '/vapid-public-key'
    const isTurnRoute = url.pathname === '/notifications/turn'

    if (!isPublicKeyRoute && !isTurnRoute) {
      return jsonResponse({ error: 'Not found.' }, 404, origin)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      })
    }

    if (isPublicKeyRoute) {
      if (request.method !== 'GET') {
        return jsonResponse(
          { error: 'Method not allowed.' },
          405,
          origin,
          { Allow: 'GET, OPTIONS' },
        )
      }

      return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY }, 200, origin)
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        { error: 'Method not allowed.' },
        405,
        origin,
        { Allow: 'POST, OPTIONS' },
      )
    }

    const idToken = bearerToken(request)
    const callerPlayerId = await authenticatePlayer(
      idToken,
      env,
      dependencies,
    )
    const recipientPlayerId = otherPlayer(callerPlayerId)

    ctx.waitUntil(
      deliverTurnNotifications(
        recipientPlayerId,
        idToken,
        env,
        dependencies,
      ),
    )

    return jsonResponse({ accepted: true }, 202, origin)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, origin)
    }

    logError('request_failed', {
      path: new URL(request.url).pathname,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonResponse({ error: 'Internal server error.' }, 500, origin)
  }
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>
