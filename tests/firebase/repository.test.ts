import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFile } from 'node:fs/promises'
import {
  get,
  ref,
  set,
  type Database,
} from 'firebase/database'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'

import { parseBaldaGame } from '../../src/games/balda/parser'
import {
  BaldaRepository,
  RepositoryError,
} from '../../src/games/balda/repository'
import {
  completeNearlyCompletedGame,
  makeNearlyCompletedGame,
} from '../../src/games/balda/testFixtures'
import type {
  BaldaGame,
  PlayerId,
  RollbackRequest,
} from '../../src/games/balda/types'

const PROJECT_ID = 'demo-simple-games'
let testEnvironment: RulesTestEnvironment

async function seedDatabase() {
  const items = Object.fromEntries(
    Array.from({ length: 100 }, (_, index) => [String(index), 'БЕРЕГ']),
  )

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database()), {
      meta: { schemaVersion: 1 },
      dictionaries: {
        balda: {
          startWords: { count: 100, items },
        },
      },
    })
  })
}

beforeAll(async () => {
  const rules = await readFile(
    new URL('../../database.rules.json', import.meta.url),
    'utf8',
  )
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules },
  })
  await seedDatabase()
})

afterEach(async () => {
  await testEnvironment.clearDatabase()
  await seedDatabase()
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

function databaseFor(playerId: PlayerId): Database {
  const email =
    playerId === 'grinch131'
      ? 'grinch131@gmail.com'
      : 'hinhillaa@gmail.com'
  return testEnvironment
    .authenticatedContext(`uid-${playerId}`, { email })
    .database() as unknown as Database
}

async function connectedRepository(playerId: PlayerId) {
  const database = databaseFor(playerId)
  const repository = new BaldaRepository(database)
  let unsubscribe: () => void = () => undefined

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Repository connection timed out.')),
      5_000,
    )
    unsubscribe = repository.subscribeSession(
      playerId,
      (session) => {
        if (session.online && session.synchronized) {
          clearTimeout(timeout)
          resolve()
        }
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })

  return { database, repository, unsubscribe }
}

async function readCurrentGame(database: Database): Promise<BaldaGame> {
  const pointer = await get(ref(database, 'gameTypes/balda/currentGameId'))
  const game = await get(
    ref(database, `gameTypes/balda/games/${String(pointer.val())}`),
  )
  return parseBaldaGame(game.val())
}

describe('BaldaRepository transactions', () => {
  it('blocks every mutation when the stored schema version is unknown', async () => {
    const database = databaseFor('grinch131')
    await set(ref(database, 'meta/schemaVersion'), 2)
    const repository = new BaldaRepository(database)
    let unsubscribe: () => void = () => undefined

    try {
      const error = await new Promise<RepositoryError>((resolve) => {
        unsubscribe = repository.subscribeSession(
          'grinch131',
          () => undefined,
          resolve,
        )
      })

      expect(error).toMatchObject({ kind: 'schema' })
      await expect(repository.createGame()).rejects.toMatchObject({
        kind: 'offline',
      })
    } finally {
      unsubscribe()
    }
  })

  it('creates only one active game when both players start concurrently', async () => {
    const first = await connectedRepository('grinch131')
    const second = await connectedRepository('hinhillaa')

    try {
      const [firstResult, secondResult] = await Promise.all([
        first.repository.createGame(),
        second.repository.createGame(),
      ])
      const stored = await readCurrentGame(databaseFor('grinch131'))

      expect(firstResult.id).toBe(secondResult.id)
      expect(stored.id).toBe(firstResult.id)
      expect(stored.status).toBe('active')
      expect(stored.board).toHaveProperty('2_0')
      expect(stored.moveCount).toBe(0)
    } finally {
      first.unsubscribe()
      second.unsubscribe()
    }
  })

  it('atomically applies one of two concurrent moves and rejects the stale one', async () => {
    const first = await connectedRepository('grinch131')
    const second = await connectedRepository('hinhillaa')

    try {
      const created = await first.repository.createGame()
      const playerId = created.turnPlayerId as PlayerId
      const results = await Promise.allSettled([
        first.repository.submitMove(created.id, playerId, {
          expectedRevision: 0,
          cell: '1_0',
          letter: 'А',
          path: ['1_0', '2_0', '2_1'],
        }),
        second.repository.submitMove(created.id, playerId, {
          expectedRevision: 0,
          cell: '1_1',
          letter: 'О',
          path: ['1_1', '2_1', '2_2'],
        }),
      ])
      const stored = await readCurrentGame(databaseFor('grinch131'))

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
        1,
      )
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
        1,
      )
      expect(stored.revision).toBe(1)
      expect(stored.moveCount).toBe(1)
      expect(Object.keys(stored.board)).toHaveLength(6)
      expect(stored.scores[playerId]).toBe(3)
      expect(Object.keys(stored.usedWords)).toHaveLength(2)
    } finally {
      first.unsubscribe()
      second.unsubscribe()
    }
  })

  it('lets only the opponent cancel an existing word rating', async () => {
    const first = await connectedRepository('grinch131')
    const second = await connectedRepository('hinhillaa')

    try {
      const created = await first.repository.createGame()
      const authorId = created.turnPlayerId as PlayerId
      const opponentId = created.playerIds.find((id) => id !== authorId) as PlayerId
      const author = authorId === 'grinch131' ? first : second
      const opponent = opponentId === 'grinch131' ? first : second
      await author.repository.resync()
      const moved = await author.repository.submitMove(created.id, authorId, {
        expectedRevision: 0,
        cell: '1_0',
        letter: 'А',
        path: ['1_0', '2_0', '2_1'],
      })
      await opponent.repository.resync()
      const rated = await opponent.repository.rateMove(
        moved.id,
        opponentId,
        1,
        'great',
      )

      expect(rated.moves?.['1']?.rating).toBe('great')
      await author.repository.resync()
      await expect(
        author.repository.cancelRating(rated.id, authorId, 1),
      ).rejects.toMatchObject({ kind: 'conflict' })

      const unrated = await opponent.repository.cancelRating(
        rated.id,
        opponentId,
        1,
      )

      expect(unrated.moves?.['1']?.rating).toBeUndefined()
      expect((await readCurrentGame(first.database)).moves?.['1']?.rating).toBeUndefined()
    } finally {
      first.unsubscribe()
      second.unsubscribe()
    }
  })

  it('rejects a stale revision and rolls back the complete last move', async () => {
    const connection = await connectedRepository('grinch131')

    try {
      const created = await connection.repository.createGame()
      const playerId = created.turnPlayerId as PlayerId
      const moved = await connection.repository.submitMove(
        created.id,
        playerId,
        {
          expectedRevision: 0,
          cell: '1_0',
          letter: 'А',
          path: ['1_0', '2_0', '2_1'],
        },
      )

      await expect(
        connection.repository.submitMove(created.id, playerId, {
          expectedRevision: 0,
          cell: '1_1',
          letter: 'О',
          path: ['1_1', '2_1'],
        }),
      ).rejects.toBeInstanceOf(RepositoryError)

      const lastMove = moved.moves?.['1']
      expect(lastMove).toBeDefined()
      const rolledBack = await connection.repository.rollbackLastMove(
        created.id,
        playerId,
        {
          expectedRevision: 1,
          expectedMoveNumber: 1,
          expectedAuthorPlayerId: playerId,
        },
      )

      expect(rolledBack.revision).toBe(2)
      expect(rolledBack.moveCount).toBe(0)
      expect(rolledBack.board['1_0']).toBeUndefined()
      expect(rolledBack.scores[playerId]).toBe(0)
      expect(rolledBack.lastWord).toBe(rolledBack.startWord)
      expect(rolledBack.usedWords.АБЕ).toBeUndefined()
    } finally {
      connection.unsubscribe()
    }
  })

  it('produces the same rollback for the author and the challenger', async () => {
    const first = await connectedRepository('grinch131')
    const second = await connectedRepository('hinhillaa')

    try {
      const created = await first.repository.createGame()
      const author = created.turnPlayerId as PlayerId
      const opponent: PlayerId =
        author === 'grinch131' ? 'hinhillaa' : 'grinch131'
      const repositories = {
        grinch131: first.repository,
        hinhillaa: second.repository,
      }
      await repositories[author].resync()
      const moved = await repositories[author].submitMove(
        created.id,
        author,
        {
          expectedRevision: 0,
          cell: '1_0',
          letter: 'А',
          path: ['1_0', '2_0', '2_1'],
        },
      )
      const request: RollbackRequest = {
        expectedRevision: moved.revision,
        expectedMoveNumber: 1,
        expectedAuthorPlayerId: author,
      }

      const selfRollback = await repositories[author].rollbackLastMove(
        moved.id,
        author,
        request,
      )
      await set(
        ref(
          repositories[opponent] === first.repository
            ? first.database
            : second.database,
          `gameTypes/balda/games/${moved.id}`,
        ),
        moved,
      )
      await repositories[opponent].resync()
      const challengedRollback = await repositories[opponent].rollbackLastMove(
        moved.id,
        opponent,
        request,
      )

      expect(challengedRollback).toEqual(selfRollback)
      expect(challengedRollback.turnPlayerId).toBe(author)
      expect(challengedRollback.moves).toBeNull()
      expect(challengedRollback.revision).toBe(2)
    } finally {
      first.unsubscribe()
      second.unsubscribe()
    }
  })

  it('rejects an attempt to roll back anything except the last move', async () => {
    const connection = await connectedRepository('grinch131')

    try {
      const created = await connection.repository.createGame()
      const firstAuthor = created.turnPlayerId as PlayerId
      const firstMove = await connection.repository.submitMove(
        created.id,
        firstAuthor,
        {
          expectedRevision: 0,
          cell: '1_0',
          letter: 'А',
          path: ['1_0', '2_0', '2_1'],
        },
      )
      const secondAuthor = firstMove.turnPlayerId as PlayerId
      const secondMove = await connection.repository.submitMove(
        created.id,
        secondAuthor,
        {
          expectedRevision: 1,
          cell: '1_1',
          letter: 'О',
          path: ['1_1', '1_0', '2_0'],
        },
      )

      await expect(
        connection.repository.rollbackLastMove(
          created.id,
          firstAuthor,
          {
            expectedRevision: secondMove.revision,
            expectedMoveNumber: 1,
            expectedAuthorPlayerId: firstAuthor,
          },
        ),
      ).rejects.toMatchObject({
        kind: 'conflict',
        domainFailure: { code: 'rollback-unavailable' },
      })

      const rolledBack = await connection.repository.rollbackLastMove(
        created.id,
        firstAuthor,
        {
          expectedRevision: secondMove.revision,
          expectedMoveNumber: 2,
          expectedAuthorPlayerId: secondAuthor,
        },
      )
      expect(rolledBack.moveCount).toBe(1)

      await expect(
        connection.repository.rollbackLastMove(
          created.id,
          secondAuthor,
          {
            expectedRevision: rolledBack.revision,
            expectedMoveNumber: 1,
            expectedAuthorPlayerId: firstAuthor,
          },
        ),
      ).rejects.toMatchObject({
        kind: 'conflict',
        domainFailure: { code: 'rollback-unavailable' },
      })
      expect((await readCurrentGame(databaseFor('grinch131'))).moveCount).toBe(1)
    } finally {
      connection.unsubscribe()
    }
  })

  it('stops after three invalid point reads of the starting dictionary', async () => {
    const connection = await connectedRepository('grinch131')

    try {
      const invalidItems = Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [String(index), 'BAD']),
      )
      await set(
        ref(
          databaseFor('grinch131'),
          'dictionaries/balda/startWords/items',
        ),
        invalidItems,
      )

      await expect(connection.repository.createGame()).rejects.toMatchObject({
        kind: 'start-word',
        message: 'Не удалось выбрать стартовое слово.',
      })
      expect(
        (
          await get(
            ref(databaseFor('grinch131'), 'gameTypes/balda/currentGameId'),
          )
        ).exists(),
      ).toBe(false)
    } finally {
      connection.unsubscribe()
    }
  })

  it('saves the final move and completed result in one transaction', async () => {
    const connection = await connectedRepository('grinch131')

    try {
      const game = makeNearlyCompletedGame()
      await set(
        ref(connection.database, 'gameTypes/balda'),
        {
          currentGameId: game.id,
          games: { [game.id]: game },
        },
      )
      await connection.repository.resync()

      const completed = await connection.repository.submitMove(
        game.id,
        game.turnPlayerId as PlayerId,
        {
          expectedRevision: game.revision,
          cell: '0_0',
          letter: 'Я',
          path: ['0_0', '0_1', '1_1'],
        },
      )

      expect(completed.status).toBe('completed')
      expect(completed.completedAt).toEqual(expect.any(Number))
      expect(completed.turnPlayerId).toBeNull()
      expect(completed.moveCount).toBe(20)
      expect(Object.keys(completed.board)).toHaveLength(25)
      expect(completed.result?.scores).toEqual(completed.scores)
      expect(completed.result?.winnerPlayerId).toBe('hinhillaa')
    } finally {
      connection.unsubscribe()
    }
  })

  it('saves a resignation atomically without changing the played state', async () => {
    const connection = await connectedRepository('grinch131')

    try {
      const created = await connection.repository.createGame()
      const resigned = await connection.repository.resignGame(
        created.id,
        'hinhillaa',
        { expectedRevision: created.revision },
      )

      expect(resigned.status).toBe('completed')
      expect(resigned.completedAt).toEqual(expect.any(Number))
      expect(resigned.revision).toBe(created.revision + 1)
      expect(resigned.turnPlayerId).toBeNull()
      expect(resigned.board).toEqual(created.board)
      expect(resigned.moves).toEqual(created.moves)
      expect(resigned.scores).toEqual(created.scores)
      expect(resigned.result).toEqual({
        winnerPlayerId: 'grinch131',
        isDraw: false,
        scores: created.scores,
        completionReason: 'resignation',
        resignedByPlayerId: 'hinhillaa',
      })
      const stored = await readCurrentGame(connection.database)
      expect(stored.completedAt).toEqual(expect.any(Number))
      expect(stored).toEqual({
        ...resigned,
        completedAt: stored.completedAt,
      })
    } finally {
      connection.unsubscribe()
    }
  })

  it('commits only one of a concurrent move and resignation', async () => {
    const first = await connectedRepository('grinch131')
    const second = await connectedRepository('hinhillaa')

    try {
      const created = await first.repository.createGame()
      await second.repository.resync()
      const turnPlayerId = created.turnPlayerId as PlayerId
      const moveRepository =
        turnPlayerId === 'grinch131'
          ? first.repository
          : second.repository
      const resigningPlayerId: PlayerId =
        turnPlayerId === 'grinch131' ? 'hinhillaa' : 'grinch131'
      const resignRepository =
        resigningPlayerId === 'grinch131'
          ? first.repository
          : second.repository

      const results = await Promise.allSettled([
        moveRepository.submitMove(created.id, turnPlayerId, {
          expectedRevision: created.revision,
          cell: '1_0',
          letter: 'А',
          path: ['1_0', '2_0', '2_1'],
        }),
        resignRepository.resignGame(
          created.id,
          resigningPlayerId,
          { expectedRevision: created.revision },
        ),
      ])

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1)
      expect((await readCurrentGame(first.database)).revision).toBe(1)
    } finally {
      first.unsubscribe()
      second.unsubscribe()
    }
  })

  it('keeps a completed game immutable through repository operations and preserves it when creating the next game', async () => {
    const connection = await connectedRepository('grinch131')

    try {
      const completed = completeNearlyCompletedGame(
        makeNearlyCompletedGame('completed-before-next'),
      )
      await set(ref(connection.database, 'gameTypes/balda'), {
        currentGameId: completed.id,
        games: { [completed.id]: completed },
      })
      await connection.repository.resync()

      await expect(
        connection.repository.submitMove(
          completed.id,
          'grinch131',
          {
            expectedRevision: completed.revision,
            cell: '0_0',
            letter: 'А',
            path: ['0_0', '0_1'],
          },
        ),
      ).rejects.toMatchObject({ kind: 'conflict' })
      await expect(
        connection.repository.resignGame(
          completed.id,
          'grinch131',
          { expectedRevision: completed.revision },
        ),
      ).rejects.toMatchObject({ kind: 'conflict' })

      await connection.repository.resync()
      const next = await connection.repository.createGame()
      expect(next.id).not.toBe(completed.id)
      const previousSnapshot = await get(
        ref(
          connection.database,
          `gameTypes/balda/games/${completed.id}`,
        ),
      )
      expect(parseBaldaGame(previousSnapshot.val())).toEqual(completed)
    } finally {
      connection.unsubscribe()
    }
  })
})
