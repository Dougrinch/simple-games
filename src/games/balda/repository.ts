import {
  get,
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  type Database,
  type Unsubscribe,
} from 'firebase/database'

import { getFirebaseServices } from '../../platform/firebase/client'
import { getGameDefinition } from '../../platform/games/registry'
import {
  applyMove,
  createInitialGame,
  isPlayerId,
  resignGame,
  rollbackLastMove,
} from './domain'
import { GameDataError, parseBaldaGame } from './parser'
import {
  clearGameSnapshot,
  loadGameSnapshot,
  saveGameSnapshot,
} from './snapshot'
import type {
  BaldaGame,
  DomainFailure,
  MoveDraft,
  PlayerId,
  ResignationRequest,
  RollbackRequest,
  WordRating,
} from './types'

const definition = getGameDefinition('balda')
const ROOT_PATH = definition.rootPath
const START_WORD_ROOT = 'dictionaries/balda/startWords'
const PROFILES_PATH = 'profiles'
const SCHEMA_PATH = 'meta/schemaVersion'

export interface PlayerProfile {
  playerId: PlayerId
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
  lastSeenAt: number
}

export interface BaldaSession {
  connectionKnown: boolean
  online: boolean
  synchronized: boolean
  game: BaldaGame | null
  profiles: Partial<Record<PlayerId, PlayerProfile>>
  fromLocalSnapshot: boolean
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'offline'
      | 'conflict'
      | 'permission'
      | 'schema'
      | 'start-word'
      | 'unknown',
    public readonly domainFailure?: DomainFailure,
  ) {
    super(message)
    this.name = 'RepositoryError'
  }
}

interface RawRoot {
  currentGameId?: unknown
  games?: Record<string, unknown>
}

function randomIndex(exclusiveMaximum: number): number {
  if (!Number.isInteger(exclusiveMaximum) || exclusiveMaximum <= 0) {
    throw new Error('Random range must be a positive integer.')
  }

  const limit = Math.floor(0x1_0000_0000 / exclusiveMaximum) * exclusiveMaximum
  const buffer = new Uint32Array(1)
  let value = 0

  do {
    crypto.getRandomValues(buffer)
    value = buffer[0] as number
  } while (value >= limit)

  return value % exclusiveMaximum
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function serializeGameWithServerTimestamps(
  game: BaldaGame,
  moveNumber?: number,
): Record<string, unknown> {
  const serialized = structuredClone(game) as unknown as Record<string, unknown>
  const board = rawRecord(serialized.board)

  for (const rawCell of Object.values(board)) {
    const cell = rawRecord(rawCell)
    if (cell.placedByPlayerId === null) {
      delete cell.placedByPlayerId
    }
    if (cell.moveNumber === null) {
      delete cell.moveNumber
    }
  }

  if (serialized.completedAt === null) {
    delete serialized.completedAt
  }
  if (serialized.turnPlayerId === null) {
    delete serialized.turnPlayerId
  }
  if (serialized.moves === null) {
    delete serialized.moves
  }
  if (serialized.result === null) {
    delete serialized.result
  }

  if (game.revision === 0) {
    serialized.createdAt = serverTimestamp()
  }

  if (moveNumber) {
    const moves = rawRecord(serialized.moves)
    const move = rawRecord(moves[String(moveNumber)])
    move.createdAt = serverTimestamp()
  }

  if (game.status === 'completed') {
    serialized.completedAt = serverTimestamp()
    const result = rawRecord(serialized.result)
    if (result.winnerPlayerId === null) {
      delete result.winnerPlayerId
    }
    if (result.resignedByPlayerId === null) {
      delete result.resignedByPlayerId
    }
  }

  for (const key of Object.keys(serialized)) {
    if (serialized[key] === undefined) {
      delete serialized[key]
    }
  }

  return serialized
}

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.toLocaleLowerCase('en-US').includes('permission') ||
      error.message.toLocaleLowerCase('en-US').includes('denied'))
  )
}

function isOfflineError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: unknown; message?: unknown }
  const code =
    typeof candidate.code === 'string'
      ? candidate.code.toLocaleLowerCase('en-US')
      : ''
  const message =
    typeof candidate.message === 'string'
      ? candidate.message.toLocaleLowerCase('en-US')
      : ''

  return (
    code.includes('network') ||
    code.includes('disconnect') ||
    code.includes('unavailable') ||
    message.includes('offline') ||
    message.includes('network') ||
    message.includes('disconnected') ||
    message.includes('connection lost')
  )
}

function mapRepositoryError(error: unknown, context: string): RepositoryError {
  if (error instanceof RepositoryError) {
    return error
  }

  if (error instanceof GameDataError) {
    return new RepositoryError(error.message, 'schema')
  }

  if (isPermissionError(error)) {
    return new RepositoryError('Доступ к игре запрещён.', 'permission')
  }

  if (isOfflineError(error)) {
    return new RepositoryError('Нет соединения.', 'offline')
  }

  console.error(`${context} failed.`, error)
  return new RepositoryError('Что-то пошло не так. Попробуй ещё раз.', 'unknown')
}

function parseProfiles(value: unknown): BaldaSession['profiles'] {
  const input = rawRecord(value)
  const profiles: BaldaSession['profiles'] = {}
  const expectedEmails: Record<PlayerId, string> = {
    grinch131: 'grinch131@gmail.com',
    hinhillaa: 'hinhillaa@gmail.com',
  }

  for (const playerId of ['grinch131', 'hinhillaa'] as const) {
    const rawProfile = rawRecord(input[playerId])
    if (Object.keys(rawProfile).length === 0) {
      continue
    }
    if (
      rawProfile.playerId !== playerId ||
      typeof rawProfile.uid !== 'string' ||
      rawProfile.uid.length === 0 ||
      rawProfile.email !== expectedEmails[playerId] ||
      typeof rawProfile.lastSeenAt !== 'number' ||
      !Number.isFinite(rawProfile.lastSeenAt) ||
      rawProfile.lastSeenAt < 0
    ) {
      throw new GameDataError(`Invalid profile for ${playerId}.`)
    }
    if (
      rawProfile.displayName != null &&
      typeof rawProfile.displayName !== 'string'
    ) {
      throw new GameDataError(`Invalid display name for ${playerId}.`)
    }
    if (
      rawProfile.photoURL != null &&
      typeof rawProfile.photoURL !== 'string'
    ) {
      throw new GameDataError(`Invalid photo URL for ${playerId}.`)
    }
    profiles[playerId] = {
      playerId,
      uid: rawProfile.uid,
      email: rawProfile.email,
      displayName:
        typeof rawProfile.displayName === 'string' &&
        rawProfile.displayName.trim()
          ? rawProfile.displayName.trim()
          : null,
      photoURL:
        typeof rawProfile.photoURL === 'string' ? rawProfile.photoURL : null,
      lastSeenAt: rawProfile.lastSeenAt,
    }
  }

  return profiles
}

export class BaldaRepository {
  private readonly database: Database
  private connected = false
  private synchronized = false
  private schemaValidated = false
  private subscribedPlayerId: PlayerId | null = null
  private resyncCurrent: (() => Promise<BaldaSession>) | null = null

  constructor(database = getFirebaseServices().database) {
    this.database = database
  }

  subscribeSession(
    playerId: PlayerId,
    listener: (session: BaldaSession) => void,
    errorListener: (error: RepositoryError) => void,
  ): Unsubscribe {
    const localGame = loadGameSnapshot(playerId)
    let active = true
    let gameUnsubscribe: Unsubscribe | null = null
    let knownGameId: string | null = localGame?.id ?? null
    let session: BaldaSession = {
      connectionKnown: false,
      online: false,
      synchronized: false,
      game: localGame,
      profiles: {},
      fromLocalSnapshot: localGame !== null,
    }

    const emit = (patch: Partial<BaldaSession> = {}) => {
      if (!active) {
        return
      }
      session = { ...session, ...patch }
      listener(session)
    }

    const report = (error: unknown, context: string) => {
      if (active) {
        errorListener(mapRepositoryError(error, context))
      }
    }

    const wireGame = (
      gameId: string | null,
      clearCurrentGame = true,
    ) => {
      if (knownGameId === gameId && gameUnsubscribe) {
        return
      }

      gameUnsubscribe?.()
      gameUnsubscribe = null
      knownGameId = gameId

      if (clearCurrentGame) {
        clearGameSnapshot(playerId)
        this.synchronized = false
        emit({
          game: null,
          synchronized: false,
          fromLocalSnapshot: false,
        })
      }

      if (!gameId) {
        clearGameSnapshot(playerId)
        this.synchronized = this.connected && this.schemaValidated
        emit({
          game: null,
          synchronized: this.synchronized,
          fromLocalSnapshot: false,
        })
        return
      }

      gameUnsubscribe = onValue(
        ref(this.database, `${ROOT_PATH}/games/${gameId}`),
        (snapshot) => {
          try {
            if (!snapshot.exists()) {
              throw new GameDataError('The current game does not exist.')
            }
            const game = parseBaldaGame(snapshot.val())
            saveGameSnapshot(playerId, game)
            this.synchronized = this.connected && this.schemaValidated
            emit({
              game,
              synchronized: this.synchronized,
              fromLocalSnapshot: false,
            })
          } catch (error) {
            report(error, 'Parsing the current game')
          }
        },
        (error) => report(error, 'Subscribing to the current game'),
      )
    }

    const resync = async (): Promise<BaldaSession> => {
      this.synchronized = false
      this.schemaValidated = false
      emit({ synchronized: false })

      try {
        const [schemaSnapshot, pointerSnapshot, profilesSnapshot] =
          await Promise.all([
            get(ref(this.database, SCHEMA_PATH)),
            get(ref(this.database, `${ROOT_PATH}/currentGameId`)),
            get(ref(this.database, PROFILES_PATH)),
          ])

        if (schemaSnapshot.val() !== definition.schemaVersion) {
          throw new RepositoryError(
            'Версия данных не поддерживается. Обнови приложение.',
            'schema',
          )
        }
        this.schemaValidated = true

        const pointerValue: unknown = pointerSnapshot.val()
        const gameId =
          typeof pointerValue === 'string' && pointerValue.length > 0
            ? pointerValue
            : null
        let game: BaldaGame | null = null

        if (gameId) {
          const gameSnapshot = await get(
            ref(this.database, `${ROOT_PATH}/games/${gameId}`),
          )
          if (!gameSnapshot.exists()) {
            throw new GameDataError('The current game does not exist.')
          }
          game = parseBaldaGame(gameSnapshot.val())
          saveGameSnapshot(playerId, game)
        } else {
          clearGameSnapshot(playerId)
        }

        wireGame(gameId, false)
        this.synchronized = true
        emit({
          connectionKnown: true,
          online: true,
          synchronized: true,
          game,
          profiles: parseProfiles(profilesSnapshot.val()),
          fromLocalSnapshot: false,
        })
        return session
      } catch (error) {
        throw mapRepositoryError(error, 'Resynchronizing the game')
      }
    }

    this.subscribedPlayerId = playerId
    this.resyncCurrent = resync

    const connectionUnsubscribe = onValue(
      ref(this.database, '.info/connected'),
      (snapshot) => {
        const online = snapshot.val() === true
        this.connected = online

        if (!online) {
          this.synchronized = false
          this.schemaValidated = false
          emit({
            connectionKnown: true,
            online: false,
            synchronized: false,
          })
          return
        }

        emit({ connectionKnown: true, online: true, synchronized: false })
        void resync().catch((error: unknown) =>
          report(error, 'Resynchronizing after reconnect'),
        )
      },
      (error) => report(error, 'Subscribing to connection state'),
    )

    const pointerUnsubscribe = onValue(
      ref(this.database, `${ROOT_PATH}/currentGameId`),
      (snapshot) => {
        if (!this.connected || !this.schemaValidated) {
          return
        }
        const value: unknown = snapshot.val()
        wireGame(typeof value === 'string' && value.length > 0 ? value : null)
      },
      (error) => report(error, 'Subscribing to the current game pointer'),
    )

    const profilesUnsubscribe = onValue(
      ref(this.database, PROFILES_PATH),
      (snapshot) => {
        try {
          emit({ profiles: parseProfiles(snapshot.val()) })
        } catch (error) {
          report(error, 'Parsing player profiles')
        }
      },
      (error) => report(error, 'Subscribing to player profiles'),
    )

    return () => {
      active = false
      connectionUnsubscribe()
      pointerUnsubscribe()
      profilesUnsubscribe()
      gameUnsubscribe?.()
      this.resyncCurrent = null
      this.connected = false
      this.synchronized = false
      this.schemaValidated = false
      this.subscribedPlayerId = null
    }
  }

  async resync(): Promise<BaldaSession> {
    if (!this.resyncCurrent) {
      throw new RepositoryError('Подписка на игру не запущена.', 'unknown')
    }
    return this.resyncCurrent()
  }

  private requireReady(): void {
    if (!this.connected) {
      throw new RepositoryError('Нет соединения.', 'offline')
    }
    if (!this.synchronized) {
      throw new RepositoryError(
        'Дождись полной синхронизации игры.',
        'offline',
      )
    }
  }

  private storeConfirmedGame(game: BaldaGame): BaldaGame {
    if (this.subscribedPlayerId) {
      saveGameSnapshot(this.subscribedPlayerId, game)
    }
    return game
  }

  private async pickStartWord(): Promise<string> {
    const countSnapshot = await get(
      ref(this.database, `${START_WORD_ROOT}/count`),
    )
    const countValue: unknown = countSnapshot.val()

    if (!Number.isInteger(countValue) || (countValue as number) < 100) {
      throw new RepositoryError(
        'Не удалось выбрать стартовое слово.',
        'start-word',
      )
    }

    const count = countValue as number

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const index = randomIndex(count)
      const wordSnapshot = await get(
        ref(this.database, `${START_WORD_ROOT}/items/${index}`),
      )
      const value: unknown = wordSnapshot.val()

      if (
        typeof value === 'string' &&
        /^[А-ЯЁ]{5}$/u.test(value) &&
        value === value.toLocaleUpperCase('ru-RU')
      ) {
        return value
      }
    }

    throw new RepositoryError(
      'Не удалось выбрать стартовое слово.',
      'start-word',
    )
  }

  async createGame(): Promise<BaldaGame> {
    this.requireReady()

    try {
      const startWord = await this.pickStartWord()
      const gameKey = push(ref(this.database, `${ROOT_PATH}/games`)).key

      if (!gameKey) {
        throw new Error('Firebase did not create a game identifier.')
      }

      const firstPlayerId: PlayerId =
        randomIndex(2) === 0 ? 'grinch131' : 'hinhillaa'
      const game = createInitialGame(
        gameKey,
        startWord,
        firstPlayerId,
        Date.now(),
      )
      const serializedGame = serializeGameWithServerTimestamps(game)
      const transaction = await runTransaction(
        ref(this.database, ROOT_PATH),
        (currentValue: unknown) => {
          const currentRoot = rawRecord(currentValue) as RawRoot
          const games = rawRecord(currentRoot.games)
          const currentGameId =
            typeof currentRoot.currentGameId === 'string'
              ? currentRoot.currentGameId
              : null

          if (currentGameId) {
            if (!games[currentGameId]) {
              return
            }
            try {
              const currentGame = parseBaldaGame(games[currentGameId])
              if (currentGame.status === 'active') {
                return
              }
            } catch {
              return
            }
          }

          return {
            ...currentRoot,
            currentGameId: gameKey,
            games: { ...games, [gameKey]: serializedGame },
          }
        },
        { applyLocally: false },
      )

      const root = rawRecord(transaction.snapshot.val())
      const currentGameId = root.currentGameId
      const games = rawRecord(root.games)

      if (typeof currentGameId !== 'string' || !games[currentGameId]) {
        throw new Error('The game transaction returned no current game.')
      }

      return this.storeConfirmedGame(parseBaldaGame(games[currentGameId]))
    } catch (error) {
      throw mapRepositoryError(error, 'Creating a game')
    }
  }

  async submitMove(
    gameId: string,
    playerId: PlayerId,
    draft: MoveDraft,
  ): Promise<BaldaGame> {
    this.requireReady()
    let domainFailure: DomainFailure | undefined
    let transactionError: unknown

    try {
      const gameReference = ref(
        this.database,
        `${ROOT_PATH}/games/${gameId}`,
      )
      const latestSnapshot = await get(gameReference)
      if (!latestSnapshot.exists()) {
        throw new GameDataError('The current game does not exist.')
      }
      const latestGame = parseBaldaGame(latestSnapshot.val())
      const preflight = applyMove(latestGame, playerId, draft, Date.now())
      if (!preflight.ok) {
        throw new RepositoryError(
          preflight.message,
          'conflict',
          preflight,
        )
      }
      const initialProposal = serializeGameWithServerTimestamps(
        preflight.value,
        preflight.value.moveCount,
      )

      const transaction = await runTransaction(
        gameReference,
        (value: unknown) => {
          if (value === null) {
            return initialProposal
          }
          try {
            const game = parseBaldaGame(value)
            const result = applyMove(game, playerId, draft, Date.now())

            if (!result.ok) {
              domainFailure = result
              return
            }

            domainFailure = undefined
            return serializeGameWithServerTimestamps(
              result.value,
              result.value.moveCount,
            )
          } catch (error) {
            transactionError = error
            return
          }
        },
        { applyLocally: false },
      )

      if (!transaction.committed) {
        if (transactionError) {
          throw transactionError
        }
        throw new RepositoryError(
          domainFailure?.message ?? 'Все сломалось, повтори!',
          'conflict',
          domainFailure,
        )
      }

      return this.storeConfirmedGame(
        parseBaldaGame(transaction.snapshot.val()),
      )
    } catch (error) {
      throw mapRepositoryError(error, 'Submitting a move')
    }
  }

  async rateMove(
    gameId: string,
    playerId: PlayerId,
    moveNumber: number,
    rating: WordRating,
  ): Promise<BaldaGame> {
    this.requireReady()
    try {
      const gameReference = ref(this.database, `${ROOT_PATH}/games/${gameId}`)
      const transaction = await runTransaction(
        gameReference,
        (value: unknown) => {
          if (value === null) return
          const game = parseBaldaGame(value)
          const move = game.moves?.[String(moveNumber)]
          if (!move || move.authorPlayerId === playerId || move.rating) return
          return serializeGameWithServerTimestamps({
            ...game,
            moves: {
              ...game.moves,
              [String(moveNumber)]: { ...move, rating },
            },
          })
        },
        { applyLocally: false },
      )
      if (!transaction.committed) {
        throw new RepositoryError(
          'Можно оценивать только чужие неоценённые слова.',
          'conflict',
        )
      }
      return this.storeConfirmedGame(parseBaldaGame(transaction.snapshot.val()))
    } catch (error) {
      throw mapRepositoryError(error, 'Rating a move')
    }
  }

  async rollbackLastMove(
    gameId: string,
    playerId: PlayerId,
    request: RollbackRequest,
  ): Promise<BaldaGame> {
    this.requireReady()
    let domainFailure: DomainFailure | undefined
    let transactionError: unknown

    try {
      const gameReference = ref(
        this.database,
        `${ROOT_PATH}/games/${gameId}`,
      )
      const latestSnapshot = await get(gameReference)
      if (!latestSnapshot.exists()) {
        throw new GameDataError('The current game does not exist.')
      }
      const latestGame = parseBaldaGame(latestSnapshot.val())
      const preflight = rollbackLastMove(latestGame, playerId, request)
      if (!preflight.ok) {
        throw new RepositoryError(
          preflight.message,
          'conflict',
          preflight,
        )
      }
      const initialProposal = serializeGameWithServerTimestamps(
        preflight.value,
      )

      const transaction = await runTransaction(
        gameReference,
        (value: unknown) => {
          if (value === null) {
            return initialProposal
          }
          try {
            const game = parseBaldaGame(value)
            const result = rollbackLastMove(game, playerId, request)

            if (!result.ok) {
              domainFailure = result
              return
            }

            domainFailure = undefined
            return serializeGameWithServerTimestamps(result.value)
          } catch (error) {
            transactionError = error
            return
          }
        },
        { applyLocally: false },
      )

      if (!transaction.committed) {
        if (transactionError) {
          throw transactionError
        }
        throw new RepositoryError(
          domainFailure?.message ?? 'Слишком поздно',
          'conflict',
          domainFailure,
        )
      }

      return this.storeConfirmedGame(
        parseBaldaGame(transaction.snapshot.val()),
      )
    } catch (error) {
      throw mapRepositoryError(error, 'Rolling back a move')
    }
  }

  async resignGame(
    gameId: string,
    playerId: PlayerId,
    request: ResignationRequest,
  ): Promise<BaldaGame> {
    this.requireReady()
    let domainFailure: DomainFailure | undefined
    let transactionError: unknown

    try {
      const gameReference = ref(
        this.database,
        `${ROOT_PATH}/games/${gameId}`,
      )
      const latestSnapshot = await get(gameReference)
      if (!latestSnapshot.exists()) {
        throw new GameDataError('The current game does not exist.')
      }
      const latestGame = parseBaldaGame(latestSnapshot.val())
      const preflight = resignGame(
        latestGame,
        playerId,
        request,
        Date.now(),
      )
      if (!preflight.ok) {
        throw new RepositoryError(
          preflight.message,
          'conflict',
          preflight,
        )
      }
      const initialProposal = serializeGameWithServerTimestamps(
        preflight.value,
      )

      const transaction = await runTransaction(
        gameReference,
        (value: unknown) => {
          if (value === null) {
            return initialProposal
          }
          try {
            const game = parseBaldaGame(value)
            const result = resignGame(
              game,
              playerId,
              request,
              Date.now(),
            )

            if (!result.ok) {
              domainFailure = result
              return
            }

            domainFailure = undefined
            return serializeGameWithServerTimestamps(result.value)
          } catch (error) {
            transactionError = error
            return
          }
        },
        { applyLocally: false },
      )

      if (!transaction.committed) {
        if (transactionError) {
          throw transactionError
        }
        throw new RepositoryError(
          domainFailure?.message ?? 'Все сломалось, повтори!',
          'conflict',
          domainFailure,
        )
      }

      return this.storeConfirmedGame(
        parseBaldaGame(transaction.snapshot.val()),
      )
    } catch (error) {
      throw mapRepositoryError(error, 'Resigning a game')
    }
  }
}

export function isAllowedPlayerId(value: unknown): value is PlayerId {
  return isPlayerId(value)
}
