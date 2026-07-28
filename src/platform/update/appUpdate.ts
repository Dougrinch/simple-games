import { registerAppServiceWorker } from '../serviceWorker/registration'

const LAST_SEEN_RELEASE_KEY = 'balda-last-seen-release-id'
const PENDING_NOTICE_KEY = 'balda-pending-update-notice'
const UPDATE_QUERY_PARAMETER = 'app-update'
const DEFAULT_CHECK_INTERVAL_MS = 60_000

export const CURRENT_BUILD_ID = __APP_BUILD_ID__
export const CURRENT_BUILD_TIME = __APP_BUILD_TIME__
export const CURRENT_RELEASE_ID = __APP_RELEASE_ID__

export interface ReleaseNote {
  id: number
  text: string
}

export interface AppUpdateNotice {
  latestReleaseId: number
  notes: ReleaseNote[]
}

interface VersionManifest {
  version: string
  builtAt: number
  latestReleaseId: number
}

export interface AppUpdateManager {
  ready: Promise<void>
  checkNow: () => Promise<void>
  stop: () => void
}

interface AppUpdateManagerOptions {
  checkIntervalMs?: number
  onNotice: (notice: AppUpdateNotice) => void
  reloadPage?: (buildId: string) => void
}

function readStorage(
  storage: Storage,
  key: string,
): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(
  storage: Storage,
  key: string,
  value: string,
): void {
  try {
    storage.setItem(key, value)
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

function removeStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

function readLastSeenReleaseId(): number | null {
  const stored = readStorage(localStorage, LAST_SEEN_RELEASE_KEY)
  if (stored === null) {
    return null
  }

  const parsed = Number(stored)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function writeLastSeenReleaseId(releaseId: number): void {
  writeStorage(
    localStorage,
    LAST_SEEN_RELEASE_KEY,
    String(releaseId),
  )
}

function parseReleaseNotes(
  value: unknown,
  requireCompleteHistory = true,
): ReleaseNote[] {
  if (!Array.isArray(value)) {
    throw new Error('Release notes response is not an array.')
  }

  const notes = value.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('id' in entry) ||
      !('text' in entry) ||
      typeof entry.id !== 'number' ||
      !Number.isSafeInteger(entry.id) ||
      entry.id < 1 ||
      typeof entry.text !== 'string' ||
      entry.text.length === 0
    ) {
      throw new Error(`Invalid release note at index ${index}.`)
    }

    return { id: entry.id, text: entry.text }
  })

  for (const [index, note] of notes.entries()) {
    const previous = notes[index - 1]
    if (
      (requireCompleteHistory && note.id !== index + 1) ||
      (!requireCompleteHistory &&
        previous &&
        note.id !== previous.id + 1)
    ) {
      throw new Error(`Invalid release note sequence at index ${index}.`)
    }
  }

  return notes
}

function parseVersionManifest(value: unknown): VersionManifest {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    !('builtAt' in value) ||
    !('latestReleaseId' in value) ||
    typeof value.version !== 'string' ||
    value.version.length === 0 ||
    typeof value.builtAt !== 'number' ||
    !Number.isFinite(value.builtAt) ||
    typeof value.latestReleaseId !== 'number' ||
    !Number.isSafeInteger(value.latestReleaseId) ||
    value.latestReleaseId < 0
  ) {
    throw new Error('Invalid application version response.')
  }

  return {
    version: value.version,
    builtAt: value.builtAt,
    latestReleaseId: value.latestReleaseId,
  }
}

function parsePendingNotice(value: string | null): AppUpdateNotice | null {
  if (!value) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('latestReleaseId' in parsed) ||
      !('notes' in parsed) ||
      typeof parsed.latestReleaseId !== 'number' ||
      !Number.isSafeInteger(parsed.latestReleaseId) ||
      parsed.latestReleaseId < 0
    ) {
      return null
    }

    const notes = parseReleaseNotes(parsed.notes, false)
    return {
      latestReleaseId: parsed.latestReleaseId,
      notes,
    }
  } catch {
    return null
  }
}

function removeUpdateQueryParameter(): boolean {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(UPDATE_QUERY_PARAMETER)) {
    return false
  }
  url.searchParams.delete(UPDATE_QUERY_PARAMETER)

  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  )
  return true
}

function readPendingNotice(): AppUpdateNotice | null {
  const arrivedAfterUpdate = removeUpdateQueryParameter()
  const pending = parsePendingNotice(
    readStorage(sessionStorage, PENDING_NOTICE_KEY),
  )
  const lastSeen = readLastSeenReleaseId()

  if (
    pending &&
    (lastSeen === null || pending.latestReleaseId > lastSeen)
  ) {
    return pending
  }

  if (pending) {
    removeStorage(sessionStorage, PENDING_NOTICE_KEY)
  }

  return arrivedAfterUpdate
    ? { latestReleaseId: CURRENT_RELEASE_ID, notes: [] }
    : null
}

function savePendingNotice(notice: AppUpdateNotice): void {
  writeStorage(
    sessionStorage,
    PENDING_NOTICE_KEY,
    JSON.stringify(notice),
  )
}

export function acknowledgeAppUpdate(releaseId: number): void {
  writeLastSeenReleaseId(releaseId)
  removeStorage(sessionStorage, PENDING_NOTICE_KEY)
}

function metadataUrl(
  filename: 'release-notes.json' | 'version.json',
  cacheBuster: string,
): string {
  const url = new URL(
    `${import.meta.env.BASE_URL}${filename}`,
    window.location.origin,
  )
  url.searchParams.set('v', cacheBuster)
  return url.href
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Application metadata returned ${response.status}.`)
  }
  return response.json()
}

async function fetchVersionManifest(): Promise<VersionManifest> {
  return parseVersionManifest(
    await readJson(
      metadataUrl('version.json', `${Date.now()}-${Math.random()}`),
    ),
  )
}

async function fetchReleaseNotes(
  buildId: string,
): Promise<ReleaseNote[]> {
  return parseReleaseNotes(
    await readJson(metadataUrl('release-notes.json', buildId)),
  )
}

function unseenNotes(
  notes: ReleaseNote[],
  lastSeenReleaseId: number,
  latestReleaseId: number,
): ReleaseNote[] {
  return notes.filter(
    ({ id }) =>
      id > lastSeenReleaseId && id <= latestReleaseId,
  )
}

function reloadWithFreshDocument(buildId: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set(UPDATE_QUERY_PARAMETER, buildId)
  window.location.replace(url.href)
}

export function startAppUpdateManager({
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  onNotice,
  reloadPage = reloadWithFreshDocument,
}: AppUpdateManagerOptions): AppUpdateManager {
  let stopped = false
  let updateStarted = false
  let activeCheck: Promise<void> | null = null

  const registrationPromise = registerAppServiceWorker().catch(() => null)

  const showCurrentNotice = async (): Promise<void> => {
    const pending = readPendingNotice()
    const lastSeen = readLastSeenReleaseId()

    if (!pending && lastSeen === null) {
      writeLastSeenReleaseId(CURRENT_RELEASE_ID)
      return
    }

    const latestReleaseId =
      pending?.latestReleaseId ?? CURRENT_RELEASE_ID
    if (
      !pending &&
      lastSeen !== null &&
      latestReleaseId <= lastSeen
    ) {
      return
    }

    let notes = pending?.notes ?? []
    if (
      notes.length === 0 &&
      lastSeen !== null &&
      latestReleaseId > lastSeen
    ) {
      try {
        notes = unseenNotes(
          await fetchReleaseNotes(CURRENT_BUILD_ID),
          lastSeen,
          latestReleaseId,
        )
      } catch {
        // The dialog still confirms the update if notes are temporarily offline.
      }
    }

    if (!stopped) {
      onNotice({ latestReleaseId, notes })
    }
  }

  const checkNow = async (): Promise<void> => {
    if (stopped || updateStarted || navigator.onLine === false) {
      return
    }
    if (activeCheck) {
      return activeCheck
    }

    activeCheck = (async () => {
      const manifest = await fetchVersionManifest()
      if (
        stopped ||
        manifest.version === CURRENT_BUILD_ID ||
        manifest.builtAt <= CURRENT_BUILD_TIME
      ) {
        return
      }

      updateStarted = true
      const lastSeen =
        readLastSeenReleaseId() ?? CURRENT_RELEASE_ID
      let notes: ReleaseNote[] = []

      try {
        notes = unseenNotes(
          await fetchReleaseNotes(manifest.version),
          lastSeen,
          manifest.latestReleaseId,
        )
      } catch {
        // The new client retries release-note loading after navigation.
      }

      savePendingNotice({
        latestReleaseId: manifest.latestReleaseId,
        notes,
      })

      const registration = await registrationPromise
      if (registration) {
        try {
          await registration.update()
          registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
        } catch {
          // A service worker failure must not block the application update.
        }
      }

      if (!stopped) {
        reloadPage(manifest.version)
      }
    })()
      .catch(() => {
        // Metadata checks are retried on the next timer or browser event.
      })
      .finally(() => {
        activeCheck = null
      })

    return activeCheck
  }

  const ready = (async () => {
    await showCurrentNotice()
    await checkNow()
  })()

  const handleOnline = () => {
    void checkNow()
  }
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void checkNow()
    }
  }

  window.addEventListener('online', handleOnline)
  document.addEventListener(
    'visibilitychange',
    handleVisibilityChange,
  )
  const intervalId = window.setInterval(
    () => void checkNow(),
    checkIntervalMs,
  )

  return {
    ready,
    checkNow,
    stop: () => {
      stopped = true
      window.clearInterval(intervalId)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    },
  }
}
