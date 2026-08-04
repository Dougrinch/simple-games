import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CURRENT_BUILD_ID,
  CURRENT_BUILD_TIME,
  CURRENT_RELEASE_ID,
  acknowledgeAppUpdate,
  startAppUpdateManager,
} from './appUpdate'

function installServiceWorker(
  registration: Partial<ServiceWorkerRegistration> = {},
) {
  const register = vi.fn().mockResolvedValue(registration)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  })
  return register
}

function manifestResponse({
  version = CURRENT_BUILD_ID,
  builtAt = CURRENT_BUILD_TIME,
  latestReleaseId = CURRENT_RELEASE_ID,
} = {}) {
  return Response.json({ version, builtAt, latestReleaseId })
}

describe('application update manager', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('registers the worker and initializes the current release silently', async () => {
    const register = installServiceWorker()
    const fetchMock = vi
      .fn()
      .mockResolvedValue(manifestResponse())
    vi.stubGlobal('fetch', fetchMock)
    const onNotice = vi.fn()

    const manager = startAppUpdateManager({
      checkIntervalMs: 60_000,
      onNotice,
    })
    await manager.ready
    manager.stop()

    expect(register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    expect(localStorage.getItem('balda-last-seen-release-id')).toBe(
      String(CURRENT_RELEASE_ID),
    )
    expect(onNotice).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reloads once with every unseen note from a newer deployment', async () => {
    const postMessage = vi.fn()
    const update = vi.fn().mockResolvedValue(undefined)
    installServiceWorker({
      update,
      waiting: { postMessage } as unknown as ServiceWorker,
    })
    localStorage.setItem(
      'balda-last-seen-release-id',
      String(CURRENT_RELEASE_ID),
    )
    const newReleaseId = CURRENT_RELEASE_ID + 2
    const allNotes = Array.from(
      { length: newReleaseId },
      (_, index) => ({
        id: index + 1,
        text:
          index + 1 <= CURRENT_RELEASE_ID
            ? 'Старое изменение'
            : `Изменение ${index + 1}`,
      }),
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        manifestResponse({
          version: 'new-build',
          builtAt: CURRENT_BUILD_TIME + 1,
          latestReleaseId: newReleaseId,
        }),
      )
      .mockResolvedValueOnce(Response.json(allNotes))
    vi.stubGlobal('fetch', fetchMock)
    const reloadPage = vi.fn()

    const manager = startAppUpdateManager({
      checkIntervalMs: 60_000,
      onNotice: vi.fn(),
      reloadPage,
    })
    await manager.ready
    manager.stop()

    expect(update).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reloadPage).toHaveBeenCalledOnce()
    expect(reloadPage).toHaveBeenCalledWith('new-build')
    expect(
      JSON.parse(
        sessionStorage.getItem('balda-pending-update-notice') ?? '',
      ),
    ).toEqual({
      latestReleaseId: newReleaseId,
      notes: allNotes.slice(CURRENT_RELEASE_ID),
    })
  })

  it('shows missed notes after opening an already updated application', async () => {
    installServiceWorker()
    localStorage.setItem('balda-last-seen-release-id', '0')
    const currentNotes = Array.from(
      { length: CURRENT_RELEASE_ID },
      (_, index) => ({
        id: index + 1,
        text: index === 0 ? 'Автообновление приложения' : 'Нутрянка',
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(currentNotes))
        .mockResolvedValueOnce(manifestResponse()),
    )
    const onNotice = vi.fn()

    const manager = startAppUpdateManager({
      checkIntervalMs: 60_000,
      onNotice,
    })
    await manager.ready
    manager.stop()

    expect(onNotice).toHaveBeenCalledWith({
      latestReleaseId: CURRENT_RELEASE_ID,
      notes: currentNotes,
    })
  })

  it('does not let a service-worker failure block the application reload', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockRejectedValue(new Error('worker failed')),
      },
    })
    localStorage.setItem(
      'balda-last-seen-release-id',
      String(CURRENT_RELEASE_ID),
    )
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          manifestResponse({
            version: 'new-build',
            builtAt: CURRENT_BUILD_TIME + 1,
          }),
        )
        .mockResolvedValueOnce(Response.json([])),
    )
    const reloadPage = vi.fn()

    const manager = startAppUpdateManager({
      checkIntervalMs: 60_000,
      onNotice: vi.fn(),
      reloadPage,
    })
    await manager.ready
    manager.stop()

    expect(reloadPage).toHaveBeenCalledWith('new-build')
  })

  it('does not show a notice after an update without release notes', async () => {
    installServiceWorker()
    localStorage.setItem(
      'balda-last-seen-release-id',
      String(CURRENT_RELEASE_ID),
    )
    sessionStorage.setItem(
      'balda-pending-update-notice',
      JSON.stringify({
        latestReleaseId: CURRENT_RELEASE_ID,
        notes: [],
      }),
    )
    window.history.replaceState(
      null,
      '',
      `/?app-update=new-build`,
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(manifestResponse()),
    )
    const onNotice = vi.fn()

    const manager = startAppUpdateManager({
      checkIntervalMs: 60_000,
      onNotice,
    })
    await manager.ready
    manager.stop()

    expect(onNotice).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    expect(
      sessionStorage.getItem('balda-pending-update-notice'),
    ).toBeNull()
  })

  it('stores acknowledgement and clears the pending notice', () => {
    sessionStorage.setItem(
      'balda-pending-update-notice',
      JSON.stringify({ latestReleaseId: 4, notes: [] }),
    )

    acknowledgeAppUpdate(4)

    expect(localStorage.getItem('balda-last-seen-release-id')).toBe('4')
    expect(
      sessionStorage.getItem('balda-pending-update-notice'),
    ).toBeNull()
  })
})
