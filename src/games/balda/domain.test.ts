import { describe, expect, it } from 'vitest'

import {
  applyMove,
  buildWord,
  canRollbackLastMove,
  coordinateToCellKey,
  createInitialGame,
  determineResult,
  isAdjacent,
  isAvailableCell,
  isBoardFull,
  normalizeWord,
  parseCellKey,
  resignGame,
  rollbackLastMove,
  validateMove,
} from './domain'
import type { BaldaGame, CellKey, MoveDraft } from './types'

function game(): BaldaGame {
  return createInitialGame('game-1', 'берег', 'grinch131', 100)
}

function validDraft(overrides: Partial<MoveDraft> = {}): MoveDraft {
  return {
    expectedRevision: 0,
    cell: '1_0',
    letter: 'А',
    path: ['1_0', '2_0', '2_1'],
    ...overrides,
  }
}

describe('cell geometry', () => {
  it('parses, formats and validates orthogonal adjacency', () => {
    expect(parseCellKey('4_3')).toEqual({ row: 4, col: 3 })
    expect(parseCellKey('5_3')).toBeNull()
    expect(coordinateToCellKey({ row: 1, col: 2 })).toBe('1_2')
    expect(isAdjacent('2_2', '2_3')).toBe(true)
    expect(isAdjacent('2_2', '1_2')).toBe(true)
    expect(isAdjacent('2_2', '1_1')).toBe(false)
    expect(isAdjacent('2_2', '2_4')).toBe(false)
  })

  it('allows only an empty cell touching the existing board', () => {
    expect(isAvailableCell(game().board, '1_0')).toBe(true)
    expect(isAvailableCell(game().board, '0_0')).toBe(false)
    expect(isAvailableCell(game().board, '2_0')).toBe(false)
  })
})

describe('word and path validation', () => {
  it('normalizes and builds a word from the ordered path', () => {
    expect(normalizeWord('  ёлка  ')).toBe('ЁЛКА')
    expect(buildWord(game().board, '1_0', 'а', ['1_0', '2_0', '2_1'])).toEqual(
      { ok: true, value: 'АБЕ' },
    )
  })

  it.each([
    ['diagonal', ['1_0', '2_1'], 'path-not-adjacent'],
    ['gap', ['1_0', '0_0'], 'path-crosses-empty-cell'],
    ['outside board', ['1_0', '5_0'], 'path-outside-board'],
    ['reused cell', ['1_0', '2_0', '1_0'], 'path-reuses-cell'],
    ['missing letter', ['2_0', '2_1'], 'path-misses-new-cell'],
    ['too short', ['1_0'], 'path-too-short'],
  ])('rejects %s paths', (_, path, code) => {
    const result = validateMove(game(), 'grinch131', validDraft({
      path: path as CellKey[],
    }))

    expect(result).toMatchObject({ ok: false, code })
  })

  it('rejects the starting word and any accepted word', () => {
    const custom = game()
    custom.usedWords.АБЕ = true

    expect(
      validateMove(custom, 'grinch131', validDraft()),
    ).toMatchObject({ ok: false, code: 'word-already-used' })
    expect(
      validateMove(game(), 'grinch131', validDraft({
        cell: '1_1',
        letter: 'Б',
        path: ['1_1', '2_1', '2_2', '2_3', '2_4'],
      })),
    ).toMatchObject({ ok: false, code: 'word-already-used' })
  })

  it('rejects an invalid letter and preserves the source game', () => {
    const before = game()
    const serialized = JSON.stringify(before)

    expect(
      validateMove(before, 'grinch131', validDraft({ letter: 'A' })),
    ).toMatchObject({ ok: false, code: 'invalid-letter' })
    expect(JSON.stringify(before)).toBe(serialized)
  })
})

describe('game transitions', () => {
  it('applies a move without mutating the previous state', () => {
    const before = game()
    const serialized = JSON.stringify(before)
    const result = applyMove(before, 'grinch131', validDraft(), 200)

    expect(result.ok).toBe(true)
    expect(JSON.stringify(before)).toBe(serialized)

    if (!result.ok) {
      return
    }

    expect(result.value.board['1_0']).toMatchObject({
      letter: 'А',
      source: 'move',
      moveNumber: 1,
    })
    expect(result.value.scores.grinch131).toBe(3)
    expect(result.value.moves?.['1']?.points).toBe(3)
    expect(result.value.moves?.['1']?.word).toBe('АБЕ')
    expect(result.value.turnPlayerId).toBe('hinhillaa')
    expect(result.value.moveCount).toBe(1)
    expect(result.value.rollbackTargetMoveNumber).toBe(1)
    expect(result.value.revision).toBe(1)
    expect(result.value.lastWord).toBe('АБЕ')
  })

  it('does not alter revision when a transition is rejected', () => {
    const before = game()
    const result = applyMove(
      before,
      'grinch131',
      validDraft({ expectedRevision: 12 }),
      200,
    )

    expect(result).toMatchObject({ ok: false, code: 'revision-changed' })
    expect(before.revision).toBe(0)
  })

  it('rolls back the complete last move and restores the previous last word', () => {
    const first = applyMove(game(), 'grinch131', validDraft(), 200)
    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
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
      300,
    )
    expect(second.ok).toBe(true)
    if (!second.ok) {
      return
    }

    const serialized = JSON.stringify(second.value)
    expect(canRollbackLastMove(second.value, 'grinch131')).toBe(true)
    const rolledBack = rollbackLastMove(second.value, 'grinch131', {
      expectedRevision: 2,
      expectedMoveNumber: 2,
      expectedAuthorPlayerId: 'hinhillaa',
    })

    expect(rolledBack.ok).toBe(true)
    expect(JSON.stringify(second.value)).toBe(serialized)
    if (!rolledBack.ok) {
      return
    }

    expect(rolledBack.value.board['1_1']).toBeUndefined()
    expect(rolledBack.value.usedWords.ОАБ).toBeUndefined()
    expect(rolledBack.value.moves?.['2']).toBeUndefined()
    expect(rolledBack.value.scores.hinhillaa).toBe(0)
    expect(rolledBack.value.turnPlayerId).toBe('hinhillaa')
    expect(rolledBack.value.moveCount).toBe(1)
    expect(rolledBack.value.rollbackTargetMoveNumber).toBeNull()
    expect(rolledBack.value.revision).toBe(3)
    expect(rolledBack.value.lastWord).toBe('АБЕ')

    expect(canRollbackLastMove(rolledBack.value, 'grinch131')).toBe(false)
    expect(canRollbackLastMove(rolledBack.value, 'hinhillaa')).toBe(false)
    expect(
      rollbackLastMove(rolledBack.value, 'hinhillaa', {
        expectedRevision: 3,
        expectedMoveNumber: 1,
        expectedAuthorPlayerId: 'grinch131',
      }),
    ).toMatchObject({ ok: false, code: 'rollback-unavailable' })

    const replacement = applyMove(
      rolledBack.value,
      'hinhillaa',
      {
        expectedRevision: 3,
        cell: '1_1',
        letter: 'И',
        path: ['1_1', '1_0', '2_0'],
      },
      400,
    )
    expect(replacement.ok).toBe(true)
    if (!replacement.ok) {
      return
    }
    expect(replacement.value.rollbackTargetMoveNumber).toBe(2)
    expect(canRollbackLastMove(replacement.value, 'grinch131')).toBe(true)
  })

  it('detects a full board, winner and draw', () => {
    const fullBoard = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => {
        const row = Math.floor(index / 5)
        const col = index % 5
        return [`${row}_${col}`, { letter: 'А', source: 'move' }]
      }),
    ) as BaldaGame['board']

    expect(isBoardFull(fullBoard)).toBe(true)
    expect(determineResult({ grinch131: 7, hinhillaa: 4 })).toMatchObject({
      winnerPlayerId: 'grinch131',
      isDraw: false,
    })
    expect(determineResult({ grinch131: 5, hinhillaa: 5 })).toEqual({
      winnerPlayerId: null,
      isDraw: true,
      scores: { grinch131: 5, hinhillaa: 5 },
      completionReason: 'board-full',
      resignedByPlayerId: null,
    })
  })

  it('finishes the game atomically with a null turn and copied result scores', () => {
    const before = game()
    const allCells = Array.from({ length: 25 }, (_, index) =>
      `${Math.floor(index / 5)}_${index % 5}`,
    ) as CellKey[]

    for (const cell of allCells) {
      if (!before.board[cell] && cell !== '1_0') {
        before.board[cell] = {
          letter: 'А',
          source: 'move',
          placedByPlayerId: 'hinhillaa',
          moveNumber: 1,
        }
      }
    }

    const result = applyMove(before, 'grinch131', validDraft(), 500)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.value.status).toBe('completed')
    expect(result.value.completedAt).toBe(500)
    expect(result.value.turnPlayerId).toBeNull()
    expect(result.value.result?.scores).toEqual(result.value.scores)
  })

  it('allows either player to resign at any revision and awards the opponent', () => {
    const moved = applyMove(game(), 'grinch131', validDraft(), 200)
    if (!moved.ok) {
      throw new Error(moved.message)
    }
    const before = moved.value
    const serialized = JSON.stringify(before)
    const result = resignGame(
      before,
      'grinch131',
      { expectedRevision: 1 },
      600,
    )

    expect(result.ok).toBe(true)
    expect(JSON.stringify(before)).toBe(serialized)
    if (!result.ok) {
      return
    }

    expect(result.value.status).toBe('completed')
    expect(result.value.completedAt).toBe(600)
    expect(result.value.revision).toBe(2)
    expect(result.value.turnPlayerId).toBeNull()
    expect(result.value.rollbackTargetMoveNumber).toBeNull()
    expect(result.value.board).toEqual(before.board)
    expect(result.value.moves).toEqual(before.moves)
    expect(result.value.scores).toEqual(before.scores)
    expect(result.value.result).toEqual({
      winnerPlayerId: 'hinhillaa',
      isDraw: false,
      scores: before.scores,
      completionReason: 'resignation',
      resignedByPlayerId: 'grinch131',
    })
  })

  it('rejects stale and repeated resignation requests', () => {
    expect(
      resignGame(
        game(),
        'grinch131',
        { expectedRevision: 4 },
        600,
      ),
    ).toMatchObject({ ok: false, code: 'revision-changed' })

    const resigned = resignGame(
      game(),
      'grinch131',
      { expectedRevision: 0 },
      600,
    )
    if (!resigned.ok) {
      throw new Error(resigned.message)
    }
    expect(
      resignGame(
        resigned.value,
        'grinch131',
        { expectedRevision: 1 },
        700,
      ),
    ).toMatchObject({ ok: false, code: 'resignation-unavailable' })
  })
})
