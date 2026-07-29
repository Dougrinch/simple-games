import { afterEach, describe, expect, it, vi } from 'vitest'

import { createInitialGame } from './domain'
import {
  clearGameSnapshot,
  loadGameSnapshot,
  saveGameSnapshot,
} from './snapshot'
import {
  completeNearlyCompletedGame,
  makeNearlyCompletedGame,
} from './testFixtures'

describe('read-only local game snapshot', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('round-trips only a validated active game for the same player', () => {
    const game = createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1)

    saveGameSnapshot('grinch131', game)

    expect(loadGameSnapshot('grinch131')).toEqual(game)
    expect(loadGameSnapshot('hinhillaa')).toBeNull()
  })

  it('discards corrupted data instead of using it as game state', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    localStorage.setItem(
      'simple-games:balda:last-confirmed:v1:grinch131',
      '{"playerId":"grinch131","game":{"schemaVersion":99}}',
    )

    expect(loadGameSnapshot('grinch131')).toBeNull()
    expect(localStorage).toHaveLength(0)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      'Ignoring an invalid local game snapshot.',
      expect.any(Error),
    )
  })

  it('removes the snapshot after a completed game', () => {
    const active = makeNearlyCompletedGame()
    saveGameSnapshot('grinch131', active)

    saveGameSnapshot(
      'grinch131',
      completeNearlyCompletedGame(active),
    )

    expect(loadGameSnapshot('grinch131')).toBeNull()
  })

  it('can be explicitly cleared on pointer change or sign-out', () => {
    saveGameSnapshot(
      'grinch131',
      createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
    )
    clearGameSnapshot('grinch131')

    expect(loadGameSnapshot('grinch131')).toBeNull()
  })
})
