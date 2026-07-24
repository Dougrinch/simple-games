import {
  PLAYER_IDS,
  type BaldaGame,
  type BaldaMove,
  type BoardCell,
  type CellKey,
  type ColumnIndex,
  type Coordinate,
  type DomainFailure,
  type DomainResult,
  type GameResult,
  type MoveDraft,
  type PlayerId,
  type RollbackRequest,
  type RowIndex,
} from './types'

export const BOARD_SIZE = 5
export const RUSSIAN_ALPHABET = [
  'А',
  'Б',
  'В',
  'Г',
  'Д',
  'Е',
  'Ё',
  'Ж',
  'З',
  'И',
  'Й',
  'К',
  'Л',
  'М',
  'Н',
  'О',
  'П',
  'Р',
  'С',
  'Т',
  'У',
  'Ф',
  'Х',
  'Ц',
  'Ч',
  'Ш',
  'Щ',
  'Ъ',
  'Ы',
  'Ь',
  'Э',
  'Ю',
  'Я',
] as const

const RUSSIAN_LETTER_PATTERN = /^[А-ЯЁ]$/u
const RUSSIAN_WORD_PATTERN = /^[А-ЯЁ]+$/u
const START_WORD_PATTERN = /^[А-ЯЁ]{5}$/u
const CELL_KEY_PATTERN = /^([0-4])_([0-4])$/u

const FAILURE_MESSAGES: Record<DomainFailure['code'], string> = {
  'game-completed': 'Партия уже завершена.',
  'not-your-turn': 'Сейчас ход вражины.',
  'revision-changed': 'Все сломалось, повтори!',
  'invalid-cell': 'Такой клетки на поле нет.',
  'occupied-cell': 'Эта клетка уже занята.',
  'cell-not-adjacent': 'Новая буква должна касаться заполненной клетки.',
  'invalid-letter': 'Выбери одну русскую букву.',
  'path-too-short': 'В слове должно быть хотя бы две буквы.',
  'path-outside-board': 'Путь вышел за границу поля.',
  'path-reuses-cell': 'Нельзя заходить в одну клетку дважды.',
  'path-not-adjacent': 'Буквы должны стоять рядом по стороне.',
  'path-crosses-empty-cell': 'Путь проходит через пустую клетку.',
  'path-misses-new-cell': 'Слово должно включать новую букву.',
  'invalid-word': 'В слове допустимы только русские буквы.',
  'word-already-used': 'Это слово уже было.',
  'rollback-unavailable': 'Этот ход уже нельзя отменить.',
  'rollback-forbidden': 'Этот ход отменить нельзя.',
}

function failure(code: DomainFailure['code']): DomainFailure {
  return { ok: false, code, message: FAILURE_MESSAGES[code] }
}

export function isPlayerId(value: unknown): value is PlayerId {
  return typeof value === 'string' && PLAYER_IDS.includes(value as PlayerId)
}

export function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === PLAYER_IDS[0] ? PLAYER_IDS[1] : PLAYER_IDS[0]
}

export function isRussianLetter(value: unknown): value is string {
  return typeof value === 'string' && RUSSIAN_LETTER_PATTERN.test(value)
}

export function normalizeWord(value: string): string {
  return value.trim().toLocaleUpperCase('ru-RU')
}

export function coordinateToCellKey(coordinate: Coordinate): CellKey {
  return `${coordinate.row}_${coordinate.col}`
}

export function parseCellKey(value: string): Coordinate | null {
  const match = CELL_KEY_PATTERN.exec(value)

  if (!match) {
    return null
  }

  return {
    row: Number(match[1]) as RowIndex,
    col: Number(match[2]) as ColumnIndex,
  }
}

export function isCellKey(value: unknown): value is CellKey {
  return typeof value === 'string' && parseCellKey(value) !== null
}

export function isAdjacent(first: CellKey, second: CellKey): boolean {
  const firstCoordinate = parseCellKey(first)
  const secondCoordinate = parseCellKey(second)

  if (!firstCoordinate || !secondCoordinate) {
    return false
  }

  const rowDistance = Math.abs(firstCoordinate.row - secondCoordinate.row)
  const columnDistance = Math.abs(firstCoordinate.col - secondCoordinate.col)

  return rowDistance + columnDistance === 1
}

export function getNeighbors(cell: CellKey): CellKey[] {
  const coordinate = parseCellKey(cell)

  if (!coordinate) {
    return []
  }

  const candidates: Array<[number, number]> = [
    [coordinate.row - 1, coordinate.col],
    [coordinate.row + 1, coordinate.col],
    [coordinate.row, coordinate.col - 1],
    [coordinate.row, coordinate.col + 1],
  ]

  return candidates
    .filter(
      ([row, col]) =>
        row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE,
    )
    .map(([row, col]) => `${row}_${col}` as CellKey)
}

export function isAvailableCell(
  board: BaldaGame['board'],
  cell: CellKey,
): boolean {
  return (
    board[cell] === undefined &&
    getNeighbors(cell).some((neighbor) => board[neighbor] !== undefined)
  )
}

export function buildWord(
  board: BaldaGame['board'],
  newCell: CellKey,
  newLetter: string,
  path: readonly CellKey[],
): DomainResult<string> {
  const letters: string[] = []

  for (const cell of path) {
    const letter = cell === newCell ? newLetter : board[cell]?.letter

    if (!letter) {
      return failure('path-crosses-empty-cell')
    }

    letters.push(letter)
  }

  const word = normalizeWord(letters.join(''))

  if (!RUSSIAN_WORD_PATTERN.test(word)) {
    return failure('invalid-word')
  }

  return { ok: true, value: word }
}

export function validateMove(
  game: BaldaGame,
  playerId: PlayerId,
  draft: MoveDraft,
): DomainResult<{ word: string; points: number }> {
  if (game.status !== 'active') {
    return failure('game-completed')
  }

  if (game.revision !== draft.expectedRevision) {
    return failure('revision-changed')
  }

  if (game.turnPlayerId !== playerId) {
    return failure('not-your-turn')
  }

  if (!isCellKey(draft.cell)) {
    return failure('invalid-cell')
  }

  if (game.board[draft.cell]) {
    return failure('occupied-cell')
  }

  if (!isAvailableCell(game.board, draft.cell)) {
    return failure('cell-not-adjacent')
  }

  const letter = normalizeWord(draft.letter)

  if (!isRussianLetter(letter)) {
    return failure('invalid-letter')
  }

  if (draft.path.length < 2) {
    return failure('path-too-short')
  }

  if (draft.path.some((cell) => !isCellKey(cell))) {
    return failure('path-outside-board')
  }

  if (new Set(draft.path).size !== draft.path.length) {
    return failure('path-reuses-cell')
  }

  for (let index = 1; index < draft.path.length; index += 1) {
    const previous = draft.path[index - 1]
    const current = draft.path[index]

    if (!previous || !current || !isAdjacent(previous, current)) {
      return failure('path-not-adjacent')
    }
  }

  if (!draft.path.includes(draft.cell)) {
    return failure('path-misses-new-cell')
  }

  const wordResult = buildWord(
    game.board,
    draft.cell,
    letter,
    draft.path,
  )

  if (!wordResult.ok) {
    return wordResult
  }

  if (game.usedWords[wordResult.value]) {
    return failure('word-already-used')
  }

  return {
    ok: true,
    value: { word: wordResult.value, points: draft.path.length },
  }
}

export function isBoardFull(board: BaldaGame['board']): boolean {
  return Object.keys(board).length === BOARD_SIZE * BOARD_SIZE
}

export function determineResult(
  scores: Record<PlayerId, number>,
): GameResult {
  const [firstPlayer, secondPlayer] = PLAYER_IDS
  const firstScore = scores[firstPlayer]
  const secondScore = scores[secondPlayer]
  const isDraw = firstScore === secondScore

  return {
    winnerPlayerId: isDraw
      ? null
      : firstScore > secondScore
        ? firstPlayer
        : secondPlayer,
    isDraw,
    scores: { ...scores },
  }
}

export function createInitialGame(
  id: string,
  startWordValue: string,
  firstPlayerId: PlayerId,
  createdAt: number,
): BaldaGame {
  const startWord = normalizeWord(startWordValue)

  if (!START_WORD_PATTERN.test(startWord)) {
    throw new Error('Starting word must contain exactly five Russian letters.')
  }

  const board: BaldaGame['board'] = {}

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    board[`2_${col}` as CellKey] = {
      letter: startWord[col] as string,
      source: 'start',
      placedByPlayerId: null,
      moveNumber: null,
    }
  }

  return {
    schemaVersion: 1,
    id,
    type: 'balda',
    status: 'active',
    createdAt,
    completedAt: null,
    revision: 0,
    playerIds: [...PLAYER_IDS],
    turnPlayerId: firstPlayerId,
    startWord,
    board,
    scores: { grinch131: 0, hinhillaa: 0 },
    usedWords: { [startWord]: true },
    moveCount: 0,
    moves: null,
    rollbackTargetMoveNumber: null,
    lastWord: startWord,
    result: null,
  }
}

export function applyMove(
  game: BaldaGame,
  playerId: PlayerId,
  draft: MoveDraft,
  createdAt: number,
): DomainResult<BaldaGame> {
  const validation = validateMove(game, playerId, draft)

  if (!validation.ok) {
    return validation
  }

  const moveNumber = game.moveCount + 1
  const letter = normalizeWord(draft.letter)
  const move: BaldaMove = {
    number: moveNumber,
    authorPlayerId: playerId,
    cell: draft.cell,
    letter,
    path: [...draft.path],
    word: validation.value.word,
    points: validation.value.points,
    createdAt,
  }
  const placedCell: BoardCell = {
    letter,
    source: 'move',
    placedByPlayerId: playerId,
    moveNumber,
  }
  const board = { ...game.board, [draft.cell]: placedCell }
  const scores = {
    ...game.scores,
    [playerId]: game.scores[playerId] + validation.value.points,
  }
  const nextGame: BaldaGame = {
    ...game,
    board,
    scores,
    usedWords: { ...game.usedWords, [validation.value.word]: true },
    moves: { ...game.moves, [String(moveNumber)]: move },
    moveCount: moveNumber,
    rollbackTargetMoveNumber: moveNumber,
    lastWord: validation.value.word,
    revision: game.revision + 1,
    turnPlayerId: otherPlayer(playerId),
  }

  if (!isBoardFull(board)) {
    return { ok: true, value: nextGame }
  }

  const completedGame: BaldaGame = {
    ...nextGame,
    status: 'completed',
    completedAt: createdAt,
    turnPlayerId: null,
    result: determineResult(scores),
  }

  return { ok: true, value: completedGame }
}

export function canRollbackLastMove(
  game: BaldaGame,
  playerId: PlayerId,
): boolean {
  if (game.status !== 'active' || game.moveCount < 1) {
    return false
  }

  const lastMove = game.moves?.[String(game.moveCount)]

  if (!lastMove) {
    return false
  }

  return (
    game.rollbackTargetMoveNumber === lastMove.number &&
    (lastMove.authorPlayerId === playerId || game.turnPlayerId === playerId)
  )
}

export function rollbackLastMove(
  game: BaldaGame,
  playerId: PlayerId,
  request: RollbackRequest,
): DomainResult<BaldaGame> {
  if (game.status !== 'active') {
    return failure('rollback-unavailable')
  }

  if (game.revision !== request.expectedRevision) {
    return failure('revision-changed')
  }

  const lastMove = game.moves?.[String(game.moveCount)]

  if (
    !lastMove ||
    lastMove.number !== request.expectedMoveNumber ||
    lastMove.authorPlayerId !== request.expectedAuthorPlayerId
  ) {
    return failure('rollback-unavailable')
  }

  if (game.rollbackTargetMoveNumber !== lastMove.number) {
    return failure('rollback-unavailable')
  }

  if (!canRollbackLastMove(game, playerId)) {
    return failure('rollback-forbidden')
  }

  const board = { ...game.board }
  const usedWords = { ...game.usedWords }
  const moves = { ...game.moves }
  delete board[lastMove.cell]
  delete usedWords[lastMove.word]
  delete moves[String(lastMove.number)]

  const previousMove = moves[String(lastMove.number - 1)]
  const scores = {
    ...game.scores,
    [lastMove.authorPlayerId]:
      game.scores[lastMove.authorPlayerId] - lastMove.points,
  }

  return {
    ok: true,
    value: {
      ...game,
      board,
      scores,
      usedWords,
      moves: Object.keys(moves).length > 0 ? moves : null,
      moveCount: game.moveCount - 1,
      rollbackTargetMoveNumber: null,
      lastWord: previousMove?.word ?? game.startWord,
      turnPlayerId: lastMove.authorPlayerId,
      revision: game.revision + 1,
    },
  }
}
