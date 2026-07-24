export const PLAYER_IDS = ['grinch131', 'hinhillaa'] as const

export type PlayerId = (typeof PLAYER_IDS)[number]
export type GameStatus = 'active' | 'completed'
export type CellSource = 'start' | 'move'
export type RowIndex = 0 | 1 | 2 | 3 | 4
export type ColumnIndex = 0 | 1 | 2 | 3 | 4
export type CellKey = `${RowIndex}_${ColumnIndex}`

export interface Coordinate {
  row: RowIndex
  col: ColumnIndex
}

export interface BoardCell {
  letter: string
  source: CellSource
  placedByPlayerId: PlayerId | null
  moveNumber: number | null
}

export interface BaldaMove {
  number: number
  authorPlayerId: PlayerId
  cell: CellKey
  letter: string
  path: CellKey[]
  word: string
  points: number
  createdAt: number
}

export interface GameResult {
  winnerPlayerId: PlayerId | null
  isDraw: boolean
  scores: Record<PlayerId, number>
}

export interface BaldaGame {
  schemaVersion: 1
  id: string
  type: 'balda'
  status: GameStatus
  createdAt: number
  completedAt: number | null
  revision: number
  playerIds: [PlayerId, PlayerId]
  turnPlayerId: PlayerId | null
  startWord: string
  board: Partial<Record<CellKey, BoardCell>>
  scores: Record<PlayerId, number>
  usedWords: Record<string, true>
  moveCount: number
  moves: Record<string, BaldaMove> | null
  lastWord: string
  result: GameResult | null
}

export interface MoveDraft {
  expectedRevision: number
  cell: CellKey
  letter: string
  path: CellKey[]
}

export interface RollbackRequest {
  expectedRevision: number
  expectedMoveNumber: number
  expectedAuthorPlayerId: PlayerId
}

export type MoveValidationCode =
  | 'game-completed'
  | 'not-your-turn'
  | 'revision-changed'
  | 'invalid-cell'
  | 'occupied-cell'
  | 'cell-not-adjacent'
  | 'invalid-letter'
  | 'path-too-short'
  | 'path-outside-board'
  | 'path-reuses-cell'
  | 'path-not-adjacent'
  | 'path-crosses-empty-cell'
  | 'path-misses-new-cell'
  | 'invalid-word'
  | 'word-already-used'
  | 'rollback-unavailable'
  | 'rollback-forbidden'

export interface DomainFailure {
  ok: false
  code: MoveValidationCode
  message: string
}

export interface DomainSuccess<T> {
  ok: true
  value: T
}

export type DomainResult<T> = DomainSuccess<T> | DomainFailure
