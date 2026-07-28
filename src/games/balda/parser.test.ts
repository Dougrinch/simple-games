import { describe, expect, it } from 'vitest'

import {
  applyMove,
  createInitialGame,
  resignGame,
  rollbackLastMove,
} from './domain'
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
    expect(parsed.result?.completionReason).toBe('board-full')
    expect(parsed.result?.resignedByPlayerId).toBeNull()
  })

  it('accepts a consistent resignation result on a partial board', () => {
    const resigned = resignGame(
      createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
      'grinch131',
      { expectedRevision: 0 },
      2,
    )
    if (!resigned.ok) {
      throw new Error(resigned.message)
    }

    expect(parseBaldaGame(resigned.value)).toEqual(resigned.value)

    const inconsistent = structuredClone(
      resigned.value,
    ) as unknown as Record<string, unknown>
    const result = inconsistent.result as Record<string, unknown>
    result.winnerPlayerId = 'grinch131'
    expect(() => parseBaldaGame(inconsistent)).toThrow(
      'The stored resignation result is inconsistent.',
    )
  })

  it('keeps legacy games safe when the rollback marker is absent', () => {
    const first = applyMove(
      createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
      'grinch131',
      {
        expectedRevision: 0,
        cell: '1_0',
        letter: 'А',
        path: ['1_0', '2_0', '2_1'],
      },
      2,
    )
    if (!first.ok) {
      throw new Error(first.message)
    }
    const second = applyMove(
      first.value,
      'hinhillaa',
      {
        expectedRevision: 1,
        cell: '1_1',
        letter: 'О',
        path: ['1_1', '1_0', '2_0'],
      },
      3,
    )
    if (!second.ok) {
      throw new Error(second.message)
    }
    const rollback = rollbackLastMove(second.value, 'grinch131', {
      expectedRevision: 2,
      expectedMoveNumber: 2,
      expectedAuthorPlayerId: 'hinhillaa',
    })
    if (!rollback.ok) {
      throw new Error(rollback.message)
    }

    const ordinaryLegacyGame = structuredClone(first.value) as unknown as Record<
      string,
      unknown
    >
    delete ordinaryLegacyGame.rollbackTargetMoveNumber
    const rolledBackLegacyGame = structuredClone(
      rollback.value,
    ) as unknown as Record<string, unknown>
    delete rolledBackLegacyGame.rollbackTargetMoveNumber

    expect(
      parseBaldaGame(ordinaryLegacyGame).rollbackTargetMoveNumber,
    ).toBe(1)
    expect(
      parseBaldaGame(rolledBackLegacyGame).rollbackTargetMoveNumber,
    ).toBeNull()
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
