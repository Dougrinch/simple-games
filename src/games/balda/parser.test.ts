import { describe, expect, it } from 'vitest'

import { createInitialGame } from './domain'
import { GameDataError, parseBaldaGame } from './parser'
import {
  completeNearlyCompletedGame,
  makeNearlyCompletedGame,
} from './testFixtures'

describe('parseBaldaGame', () => {
  it('normalizes absent Firebase fields to null', () => {
    const input = structuredClone(
      createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
    ) as unknown as Record<string, unknown>
    delete input.completedAt
    delete input.moves
    delete input.result
    const board = input.board as Record<string, Record<string, unknown>>
    for (const cell of Object.values(board)) {
      delete cell.placedByPlayerId
      delete cell.moveNumber
    }

    const parsed = parseBaldaGame(input)

    expect(parsed.completedAt).toBeNull()
    expect(parsed.moves).toBeNull()
    expect(parsed.result).toBeNull()
    expect(parsed.board['2_0']).toMatchObject({
      placedByPlayerId: null,
      moveNumber: null,
    })
  })

  it('normalizes an absent draw winner to null', () => {
    const completed = completeNearlyCompletedGame(
      makeNearlyCompletedGame(),
      ['0_0', '0_1'],
    )
    const input = structuredClone(completed) as unknown as Record<string, unknown>
    delete input.turnPlayerId
    const result = input.result as Record<string, unknown>
    delete result.winnerPlayerId

    const parsed = parseBaldaGame(input)

    expect(parsed.status).toBe('completed')
    expect(parsed.result?.isDraw).toBe(true)
    expect(parsed.result?.winnerPlayerId).toBeNull()
  })

  it('rejects an unsupported schema and inconsistent stored state', () => {
    const unsupported = structuredClone(
      createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
    ) as unknown as Record<string, unknown>
    unsupported.schemaVersion = 2

    expect(() => parseBaldaGame(unsupported)).toThrow(
      'Unsupported game schema version.',
    )

    const inconsistent = createInitialGame(
      'game-2',
      'БЕРЕГ',
      'grinch131',
      1,
    )
    inconsistent.scores.grinch131 = 99

    expect(() => parseBaldaGame(inconsistent)).toThrow(GameDataError)
  })
})
