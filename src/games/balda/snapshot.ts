import { parseBaldaGame } from './parser'
import type { BaldaGame, PlayerId } from './types'

const SNAPSHOT_PREFIX = 'simple-games:balda:last-confirmed:v1'

interface StoredSnapshot {
  playerId: PlayerId
  gameId: string
  revision: number
  savedAt: number
  game: BaldaGame
}

function snapshotKey(playerId: PlayerId): string {
  return `${SNAPSHOT_PREFIX}:${playerId}`
}

export function loadGameSnapshot(playerId: PlayerId): BaldaGame | null {
  try {
    const serialized = globalThis.localStorage?.getItem(snapshotKey(playerId))

    if (!serialized) {
      return null
    }

    const input = JSON.parse(serialized) as Partial<StoredSnapshot>
    const game = parseBaldaGame(input.game)

    if (
      input.playerId !== playerId ||
      input.gameId !== game.id ||
      input.revision !== game.revision ||
      typeof input.savedAt !== 'number' ||
      !Number.isFinite(input.savedAt) ||
      input.savedAt < 0 ||
      game.status !== 'active'
    ) {
      clearGameSnapshot(playerId)
      return null
    }

    return game
  } catch (error) {
    console.warn('Ignoring an invalid local game snapshot.', error)
    clearGameSnapshot(playerId)
    return null
  }
}

export function saveGameSnapshot(
  playerId: PlayerId,
  game: BaldaGame,
): void {
  if (game.status !== 'active') {
    clearGameSnapshot(playerId)
    return
  }

  const snapshot: StoredSnapshot = {
    playerId,
    gameId: game.id,
    revision: game.revision,
    savedAt: Date.now(),
    game,
  }

  try {
    globalThis.localStorage?.setItem(
      snapshotKey(playerId),
      JSON.stringify(snapshot),
    )
  } catch (error) {
    console.warn('Saving the local game snapshot failed.', error)
  }
}

export function clearGameSnapshot(playerId: PlayerId): void {
  try {
    globalThis.localStorage?.removeItem(snapshotKey(playerId))
  } catch (error) {
    console.warn('Clearing the local game snapshot failed.', error)
  }
}
