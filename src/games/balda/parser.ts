import {
  isAdjacent,
  isCellKey,
  isPlayerId,
  isRussianLetter,
  normalizeWord,
} from './domain'
import type {
  BaldaGame,
  BaldaMove,
  BoardCell,
  CellKey,
  GameResult,
  PlayerId,
} from './types'

const GAME_FIELDS = new Set([
  'schemaVersion',
  'id',
  'type',
  'status',
  'createdAt',
  'completedAt',
  'revision',
  'playerIds',
  'turnPlayerId',
  'startWord',
  'board',
  'scores',
  'usedWords',
  'moveCount',
  'moves',
  'rollbackTargetMoveNumber',
  'lastWord',
  'result',
])
const BOARD_CELL_FIELDS = new Set([
  'letter',
  'source',
  'placedByPlayerId',
  'moveNumber',
])
const MOVE_FIELDS = new Set([
  'number',
  'authorPlayerId',
  'cell',
  'letter',
  'path',
  'word',
  'points',
  'createdAt',
  'rating',
])

export class GameDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameDataError'
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GameDataError(`${label} must be an object.`)
  }

  return value as Record<string, unknown>
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new GameDataError(`${label} must be an integer of at least ${minimum}.`)
  }

  return value as number
}

function timestamp(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new GameDataError(`${label} must be a timestamp.`)
  }

  return value
}

function parseBoard(value: unknown): BaldaGame['board'] {
  const input = record(value, 'board')
  const board: BaldaGame['board'] = {}

  for (const [key, rawCell] of Object.entries(input)) {
    if (!isCellKey(key)) {
      throw new GameDataError(`Invalid board cell key: ${key}.`)
    }

    const cell = record(rawCell, `board.${key}`)
    const unknownField = Object.keys(cell).find(
      (field) => !BOARD_CELL_FIELDS.has(field),
    )
    if (unknownField) {
      throw new GameDataError(`Unknown field in board.${key}: ${unknownField}.`)
    }
    if (!isRussianLetter(cell.letter)) {
      throw new GameDataError(`Invalid letter in board.${key}.`)
    }

    if (cell.source !== 'start' && cell.source !== 'move') {
      throw new GameDataError(`Invalid source in board.${key}.`)
    }

    const parsedCell: BoardCell = {
      letter: cell.letter,
      source: cell.source,
      placedByPlayerId: null,
      moveNumber: null,
    }

    if (cell.source === 'move') {
      if (!isPlayerId(cell.placedByPlayerId)) {
        throw new GameDataError(`Invalid player in board.${key}.`)
      }
      parsedCell.placedByPlayerId = cell.placedByPlayerId
      parsedCell.moveNumber = integer(
        cell.moveNumber,
        `board.${key}.moveNumber`,
        1,
      )
    } else if (
      cell.placedByPlayerId != null ||
      cell.moveNumber != null
    ) {
      throw new GameDataError(`Start cell ${key} has move-only fields.`)
    }

    board[key] = parsedCell
  }

  return board
}

function parseScores(value: unknown): Record<PlayerId, number> {
  const input = record(value, 'scores')
  return {
    grinch131: integer(input.grinch131, 'scores.grinch131'),
    hinhillaa: integer(input.hinhillaa, 'scores.hinhillaa'),
  }
}

function parseUsedWords(value: unknown): Record<string, true> {
  const input = record(value, 'usedWords')
  const words: Record<string, true> = {}

  for (const [word, marker] of Object.entries(input)) {
    if (!/^[А-ЯЁ]{2,25}$/u.test(word) || marker !== true) {
      throw new GameDataError(`Invalid used word: ${word}.`)
    }
    words[word] = true
  }

  return words
}

function parsePath(value: unknown, label: string): CellKey[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 25) {
    throw new GameDataError(`${label} must contain 2 to 25 cells.`)
  }

  if (!value.every(isCellKey)) {
    throw new GameDataError(`${label} contains an invalid cell.`)
  }

  return [...value]
}

function parseMove(value: unknown, key: string): BaldaMove {
  const input = record(value, `moves.${key}`)
  const unknownField = Object.keys(input).find(
    (field) => !MOVE_FIELDS.has(field),
  )
  if (unknownField) {
    throw new GameDataError(`Unknown field in moves.${key}: ${unknownField}.`)
  }
  const number = integer(input.number, `moves.${key}.number`, 1)

  if (String(number) !== key || !isPlayerId(input.authorPlayerId)) {
    throw new GameDataError(`Invalid move identity at moves.${key}.`)
  }

  if (!isCellKey(input.cell) || !isRussianLetter(input.letter)) {
    throw new GameDataError(`Invalid placed cell at moves.${key}.`)
  }

  if (
    typeof input.word !== 'string' ||
    normalizeWord(input.word) !== input.word ||
    !/^[А-ЯЁ]{2,25}$/u.test(input.word)
  ) {
    throw new GameDataError(`Invalid word at moves.${key}.`)
  }

  const path = parsePath(input.path, `moves.${key}.path`)
  const points = integer(input.points, `moves.${key}.points`, 2)

  if (points !== path.length) {
    throw new GameDataError(`Move points do not match path at moves.${key}.`)
  }

  if (
    input.rating !== undefined &&
    input.rating !== 'bad' &&
    input.rating !== 'great' &&
    input.rating !== 'angry'
  ) {
    throw new GameDataError(`Invalid rating at moves.${key}.`)
  }

  return {
    number,
    authorPlayerId: input.authorPlayerId,
    cell: input.cell,
    letter: input.letter,
    path,
    word: input.word,
    points,
    createdAt: timestamp(input.createdAt, `moves.${key}.createdAt`),
    ...(input.rating === undefined ? {} : { rating: input.rating }),
  }
}

function parseMoves(value: unknown): Record<string, BaldaMove> | null {
  if (value === undefined || value === null) {
    return null
  }

  const entries = Array.isArray(value)
    ? value.flatMap((move, index) =>
        index > 0 && move !== null && move !== undefined
          ? [[String(index), move] as const]
          : [],
      )
    : Object.entries(record(value, 'moves'))

  const parsed = Object.fromEntries(
    entries.map(([key, move]) => [key, parseMove(move, key)]),
  )
  return Object.keys(parsed).length > 0 ? parsed : null
}

function parseResult(value: unknown): GameResult {
  const input = record(value, 'result')
  const isDraw = input.isDraw

  if (typeof isDraw !== 'boolean') {
    throw new GameDataError('result.isDraw must be a boolean.')
  }

  const winner =
    input.winnerPlayerId === undefined || input.winnerPlayerId === null
      ? null
      : input.winnerPlayerId

  if (winner !== null && !isPlayerId(winner)) {
    throw new GameDataError('result.winnerPlayerId is invalid.')
  }

  const completionReason =
    input.completionReason === undefined
      ? 'board-full'
      : input.completionReason
  if (
    completionReason !== 'board-full' &&
    completionReason !== 'resignation'
  ) {
    throw new GameDataError('result.completionReason is invalid.')
  }

  const resignedByPlayerId =
    input.resignedByPlayerId === undefined ||
    input.resignedByPlayerId === null
      ? null
      : input.resignedByPlayerId
  if (
    resignedByPlayerId !== null &&
    !isPlayerId(resignedByPlayerId)
  ) {
    throw new GameDataError('result.resignedByPlayerId is invalid.')
  }

  return {
    winnerPlayerId: winner,
    isDraw,
    scores: parseScores(input.scores),
    completionReason,
    resignedByPlayerId,
  }
}

function validateConsistency(game: BaldaGame): void {
  for (let col = 0; col < 5; col += 1) {
    const key = `2_${col}` as CellKey
    const cell = game.board[key]
    if (
      !cell ||
      cell.source !== 'start' ||
      cell.letter !== game.startWord[col]
    ) {
      throw new GameDataError('Starting word does not match the board.')
    }
  }

  const startCells = Object.entries(game.board).filter(
    ([, cell]) => cell?.source === 'start',
  )
  if (startCells.length !== 5) {
    throw new GameDataError('The board has an invalid number of start cells.')
  }

  if (Object.keys(game.board).length !== 5 + game.moveCount) {
    throw new GameDataError('Board size does not match the move count.')
  }

  const expectedWords = new Set([game.startWord])
  const expectedScores: Record<PlayerId, number> = {
    grinch131: 0,
    hinhillaa: 0,
  }

  for (let number = 1; number <= game.moveCount; number += 1) {
    const move = game.moves?.[String(number)]
    if (!move) {
      throw new GameDataError(`Move ${number} is missing.`)
    }

    const placedCell = game.board[move.cell]
    if (
      !placedCell ||
      placedCell.source !== 'move' ||
      placedCell.letter !== move.letter ||
      placedCell.placedByPlayerId !== move.authorPlayerId ||
      placedCell.moveNumber !== number
    ) {
      throw new GameDataError(`Move ${number} does not match its board cell.`)
    }

    if (
      !move.path.includes(move.cell) ||
      new Set(move.path).size !== move.path.length
    ) {
      throw new GameDataError(`Move ${number} has an invalid path.`)
    }

    for (let index = 0; index < move.path.length; index += 1) {
      const pathCell = game.board[move.path[index] as CellKey]
      if (
        !pathCell ||
        (pathCell.source === 'move' &&
          (pathCell.moveNumber === null || pathCell.moveNumber > number))
      ) {
        throw new GameDataError(`Move ${number} crosses an unavailable cell.`)
      }
      if (
        index > 0 &&
        !isAdjacent(
          move.path[index - 1] as CellKey,
          move.path[index] as CellKey,
        )
      ) {
        throw new GameDataError(`Move ${number} has a broken path.`)
      }
    }

    const word = move.path
      .map((cell) => game.board[cell]?.letter ?? '')
      .join('')
    if (word !== move.word) {
      throw new GameDataError(`Move ${number} word does not match its path.`)
    }

    if (expectedWords.has(move.word)) {
      throw new GameDataError(`Move ${number} repeats a word.`)
    }
    expectedWords.add(move.word)
    expectedScores[move.authorPlayerId] += move.points
  }

  if (
    Object.keys(game.usedWords).length !== expectedWords.size ||
    [...expectedWords].some((word) => game.usedWords[word] !== true)
  ) {
    throw new GameDataError('Used words do not match the move history.')
  }

  if (
    game.scores.grinch131 !== expectedScores.grinch131 ||
    game.scores.hinhillaa !== expectedScores.hinhillaa
  ) {
    throw new GameDataError('Scores do not match the move history.')
  }

  const expectedLastWord =
    game.moves?.[String(game.moveCount)]?.word ?? game.startWord
  if (game.lastWord !== expectedLastWord) {
    throw new GameDataError('Last word does not match the move history.')
  }

  if (game.status === 'completed') {
    if (!game.result) {
      throw new GameDataError('A completed game must have a result.')
    }
    if (
      game.result.scores.grinch131 !== game.scores.grinch131 ||
      game.result.scores.hinhillaa !== game.scores.hinhillaa
    ) {
      throw new GameDataError('Result scores do not match game scores.')
    }

    if (game.result.completionReason === 'board-full') {
      if (
        Object.keys(game.board).length !== 25 ||
        game.result.resignedByPlayerId !== null
      ) {
        throw new GameDataError(
          'A board-full result requires a full board.',
        )
      }
      const isDraw = game.scores.grinch131 === game.scores.hinhillaa
      const expectedWinner = isDraw
        ? null
        : game.scores.grinch131 > game.scores.hinhillaa
          ? 'grinch131'
          : 'hinhillaa'
      if (
        game.result.isDraw !== isDraw ||
        game.result.winnerPlayerId !== expectedWinner
      ) {
        throw new GameDataError('The stored game result is inconsistent.')
      }
      return
    }

    const resignedByPlayerId = game.result.resignedByPlayerId
    if (
      resignedByPlayerId === null ||
      game.result.isDraw ||
      game.result.winnerPlayerId !==
        (resignedByPlayerId === 'grinch131'
          ? 'hinhillaa'
          : 'grinch131')
    ) {
      throw new GameDataError('The stored resignation result is inconsistent.')
    }
  }
}

export function parseBaldaGame(value: unknown): BaldaGame {
  const input = record(value, 'game')
  const unknownField = Object.keys(input).find((key) => !GAME_FIELDS.has(key))

  if (unknownField) {
    throw new GameDataError(`Unknown game field: ${unknownField}.`)
  }

  if (input.schemaVersion !== 1) {
    throw new GameDataError('Unsupported game schema version.')
  }

  if (
    typeof input.id !== 'string' ||
    input.id.length === 0 ||
    input.type !== 'balda'
  ) {
    throw new GameDataError('Invalid game identity.')
  }

  if (input.status !== 'active' && input.status !== 'completed') {
    throw new GameDataError('Invalid game status.')
  }

  if (
    !Array.isArray(input.playerIds) ||
    input.playerIds.length !== 2 ||
    input.playerIds[0] !== 'grinch131' ||
    input.playerIds[1] !== 'hinhillaa'
  ) {
    throw new GameDataError('Invalid game players.')
  }

  if (
    typeof input.startWord !== 'string' ||
    !/^[А-ЯЁ]{5}$/u.test(input.startWord)
  ) {
    throw new GameDataError('Invalid starting word.')
  }

  if (
    typeof input.lastWord !== 'string' ||
    !/^[А-ЯЁ]{2,25}$/u.test(input.lastWord)
  ) {
    throw new GameDataError('Invalid last word.')
  }

  const moveCount = integer(input.moveCount, 'moveCount')
  const moves = parseMoves(input.moves)
  const revision = integer(input.revision, 'revision')

  if (Object.keys(moves ?? {}).length !== moveCount) {
    throw new GameDataError('Move count does not match moves.')
  }

  const rollbackTargetMoveNumber =
    input.rollbackTargetMoveNumber === undefined ||
    input.rollbackTargetMoveNumber === null
      ? revision === moveCount && moveCount > 0
        ? moveCount
        : null
      : integer(
          input.rollbackTargetMoveNumber,
          'rollbackTargetMoveNumber',
          1,
        )

  if (
    rollbackTargetMoveNumber !== null &&
    rollbackTargetMoveNumber !== moveCount
  ) {
    throw new GameDataError(
      'Rollback target does not match the last accepted move.',
    )
  }

  const game: BaldaGame = {
    schemaVersion: 1,
    id: input.id,
    type: 'balda',
    status: input.status,
    createdAt: timestamp(input.createdAt, 'createdAt'),
    completedAt: null,
    revision,
    playerIds: ['grinch131', 'hinhillaa'],
    turnPlayerId: null,
    startWord: input.startWord,
    board: parseBoard(input.board),
    scores: parseScores(input.scores),
    usedWords: parseUsedWords(input.usedWords),
    moveCount,
    moves,
    rollbackTargetMoveNumber,
    lastWord: input.lastWord,
    result: null,
  }

  if (input.status === 'active') {
    if (input.completedAt != null || input.result != null) {
      throw new GameDataError('Active game contains completion fields.')
    }
    if (!isPlayerId(input.turnPlayerId)) {
      throw new GameDataError('Active game has no valid turn player.')
    }
    game.turnPlayerId = input.turnPlayerId
  } else {
    if (input.turnPlayerId != null) {
      throw new GameDataError('Completed game still has a turn player.')
    }
    game.turnPlayerId = null
    game.completedAt = timestamp(input.completedAt, 'completedAt')
    game.result = parseResult(input.result)
  }

  validateConsistency(game)
  return game
}
