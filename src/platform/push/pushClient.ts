import { getIdToken } from 'firebase/auth'
import { ref, set } from 'firebase/database'

import type { PlayerId } from '../../games/balda/types'
import { getFirebaseServices } from '../firebase/client'

const DEVICE_ID_KEY = 'balda-push-device-id'

export type PushNotificationStatus =
  | 'prompt'
  | 'enabled'
  | 'denied'
  | 'unsupported'

export type PushClientErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'configuration'
  | 'worker'

export class PushClientError extends Error {
  constructor(
    message: string,
    public readonly code: PushClientErrorCode,
  ) {
    super(message)
    this.name = 'PushClientError'
  }
}

function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function pushWorkerUrl(): string {
  const configured = import.meta.env.VITE_PUSH_WORKER_URL?.trim()
  if (!configured) {
    throw new PushClientError(
      'VITE_PUSH_WORKER_URL is not configured.',
      'configuration',
    )
  }

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new PushClientError(
      'VITE_PUSH_WORKER_URL is not a valid URL.',
      'configuration',
    )
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new PushClientError(
      'VITE_PUSH_WORKER_URL must use HTTP or HTTPS.',
      'configuration',
    )
  }

  return url.href.replace(/\/$/u, '')
}

export function base64urlToUint8Array(
  value: string,
): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded.replace(/-/gu, '+').replace(/_/gu, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)?.trim()
  if (existing) {
    return existing
  }

  const created = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, created)
  return created
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!pushSupported()) {
    return 'unsupported'
  }

  if (Notification.permission === 'denied') {
    return 'denied'
  }
  if (Notification.permission !== 'granted') {
    return 'prompt'
  }

  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  )
  if (!registration) {
    return 'prompt'
  }

  const subscription = await registration.pushManager.getSubscription()
  return subscription ? 'enabled' : 'prompt'
}

async function readVapidPublicKey(): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${pushWorkerUrl()}/vapid-public-key`)
  } catch {
    throw new PushClientError('Push Worker is unavailable.', 'worker')
  }

  if (!response.ok) {
    throw new PushClientError(
      `Push Worker returned ${response.status}.`,
      'worker',
    )
  }

  const data: unknown = await response.json()
  const publicKey =
    data &&
    typeof data === 'object' &&
    'publicKey' in data &&
    typeof data.publicKey === 'string'
      ? data.publicKey.trim()
      : ''

  if (!publicKey) {
    throw new PushClientError(
      'Push Worker returned an invalid VAPID key.',
      'worker',
    )
  }

  return publicKey
}

export async function enablePushNotifications(
  playerId: PlayerId,
): Promise<void> {
  if (!pushSupported()) {
    throw new PushClientError(
      'Push notifications are not supported.',
      'unsupported',
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new PushClientError(
      'Notification permission was not granted.',
      'permission-denied',
    )
  }

  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    { scope: import.meta.env.BASE_URL },
  )
  const publicKey = await readVapidPublicKey()
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64urlToUint8Array(publicKey),
    }))
  const { database } = getFirebaseServices()

  await set(
    ref(
      database,
      `pushSubscriptions/${playerId}/${getDeviceId()}`,
    ),
    subscription.toJSON(),
  )
}

export async function notifyOtherPlayer(): Promise<void> {
  const user = getFirebaseServices().auth.currentUser
  if (!user) {
    throw new PushClientError(
      'Firebase user is not signed in.',
      'configuration',
    )
  }

  const idToken = await getIdToken(user)
  const response = await fetch(
    `${pushWorkerUrl()}/notifications/turn`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    },
  )

  if (!response.ok) {
    throw new PushClientError(
      `Push Worker returned ${response.status}.`,
      'worker',
    )
  }
}
