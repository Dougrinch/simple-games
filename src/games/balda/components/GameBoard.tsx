import { useRef } from 'react'

import {
  coordinateToCellKey,
  isAdjacent,
  parseCellKey,
} from '../domain'
import type { BaldaGame, CellKey } from '../types'

interface DraftCell {
  cell: CellKey
  letter: string
}

interface GameBoardProps {
  game: BaldaGame
  draft: DraftCell | null
  disabled: boolean
  onCellPress: (cell: CellKey) => void
  onPathComplete: (path: CellKey[], invalidMessage: string | null) => void
}

interface GestureState {
  pointerId: number
  path: CellKey[]
  invalidMessage: string | null
}

type PathDirection = 'up' | 'right' | 'down' | 'left'

const CELL_KEYS = Array.from({ length: 25 }, (_, index) =>
  coordinateToCellKey({
    row: Math.floor(index / 5) as 0 | 1 | 2 | 3 | 4,
    col: (index % 5) as 0 | 1 | 2 | 3 | 4,
  }),
)

function directionTo(
  fromCell: CellKey,
  toCell: CellKey | undefined,
): PathDirection | undefined {
  if (!toCell) {
    return undefined
  }

  const from = parseCellKey(fromCell)
  const to = parseCellKey(toCell)
  if (!from || !to) {
    return undefined
  }

  if (to.row < from.row) {
    return 'up'
  }
  if (to.col > from.col) {
    return 'right'
  }
  if (to.row > from.row) {
    return 'down'
  }
  if (to.col < from.col) {
    return 'left'
  }

  return undefined
}

function cellFromPoint(clientX: number, clientY: number): CellKey | null {
  const element = document.elementFromPoint?.(clientX, clientY)
  const cellElement = element?.closest<HTMLElement>('[data-cell-key]')
  const value = cellElement?.dataset.cellKey
  return value && parseCellKey(value) ? (value as CellKey) : null
}

export function GameBoard({
  game,
  draft,
  disabled,
  onCellPress,
  onPathComplete,
}: GameBoardProps) {
  const lastMove = game.moves?.[String(game.moveCount)]
  const gestureRef = useRef<GestureState | null>(null)
  const suppressNextClickRef = useRef(false)

  const updatePath = (
    nextCell: CellKey | null,
    boardElement: HTMLDivElement,
  ) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.invalidMessage) {
      return
    }

    if (!nextCell) {
      return
    }

    if (!game.board[nextCell] && draft?.cell !== nextCell) {
      return
    }

    const lastCell = gesture.path.at(-1)
    if (lastCell === nextCell) {
      return
    }

    if (gesture.path.includes(nextCell)) {
      gesture.invalidMessage = 'Нельзя заходить в одну клетку дважды.'
    } else if (lastCell && !isAdjacent(lastCell, nextCell)) {
      gesture.invalidMessage = 'Буквы должны стоять рядом по стороне.'
    } else {
      gesture.path.push(nextCell)
    }

    boardElement.dataset.gestureError = gesture.invalidMessage ?? ''
    boardElement.dataset.path = gesture.path.join(',')
    const status = boardElement.parentElement?.querySelector<HTMLElement>(
      '[data-gesture-status]',
    )
    if (status) {
      status.textContent = gesture.invalidMessage
        ? `Ошибка: ${gesture.invalidMessage}`
        : `Выбрано клеток: ${gesture.path.length}`
    }
    for (const cellElement of boardElement.querySelectorAll<HTMLElement>(
      '[data-cell-key]',
    )) {
      const key = cellElement.dataset.cellKey as CellKey
      const order = gesture.path.indexOf(key)
      cellElement.dataset.pathPrev =
        order >= 0
          ? (directionTo(key, gesture.path[order - 1]) ?? '')
          : ''
      cellElement.dataset.pathNext =
        order >= 0
          ? (directionTo(key, gesture.path[order + 1]) ?? '')
          : ''
      cellElement.classList.toggle('is-in-path', order >= 0)
      cellElement.classList.toggle(
        'is-path-invalid',
        order >= 0 && gesture.invalidMessage !== null,
      )
    }
  }

  const clearGesturePresentation = (boardElement: HTMLDivElement) => {
    boardElement.classList.remove('is-gesturing')
    boardElement.dataset.gestureError = ''
    boardElement.dataset.path = ''
    const status = boardElement.parentElement?.querySelector<HTMLElement>(
      '[data-gesture-status]',
    )
    if (status) {
      status.textContent = draft
        ? 'Проведи одним движением через буквы слова'
        : 'Нажми на свободную клетку рядом с буквой'
    }
    for (const cellElement of boardElement.querySelectorAll<HTMLElement>(
      '[data-cell-key]',
    )) {
      cellElement.dataset.pathPrev = ''
      cellElement.dataset.pathNext = ''
      cellElement.classList.remove('is-in-path', 'is-path-invalid')
    }
  }

  return (
    <div className="board-shell">
      <div
        className="game-board"
        role="grid"
        aria-label="Игровое поле 5 на 5"
        data-gesture-error=""
        onPointerDown={(event) => {
          if (disabled || !draft || gestureRef.current) {
            return
          }

          const startCell =
            (event.target as HTMLElement)
              .closest<HTMLElement>('[data-cell-key]')
              ?.dataset.cellKey ?? null

          if (!startCell || !parseCellKey(startCell)) {
            return
          }

          const cell = startCell as CellKey
          if (!game.board[cell] && draft.cell !== cell) {
            return
          }

          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          event.currentTarget.classList.add('is-gesturing')
          gestureRef.current = {
            pointerId: event.pointerId,
            path: [],
            invalidMessage: null,
          }
          updatePath(cell, event.currentTarget)
        }}
        onPointerMove={(event) => {
          const gesture = gestureRef.current
          if (!gesture || gesture.pointerId !== event.pointerId) {
            return
          }

          event.preventDefault()
          updatePath(
            cellFromPoint(event.clientX, event.clientY),
            event.currentTarget,
          )
        }}
        onPointerUp={(event) => {
          const gesture = gestureRef.current
          if (!gesture || gesture.pointerId !== event.pointerId) {
            return
          }

          event.preventDefault()
          const completedGesture = gesture
          gestureRef.current = null
          suppressNextClickRef.current = true
          globalThis.setTimeout(() => {
            suppressNextClickRef.current = false
          }, 0)
          event.currentTarget.releasePointerCapture?.(event.pointerId)
          clearGesturePresentation(event.currentTarget)
          if (
            completedGesture.path.length === 1 &&
            completedGesture.invalidMessage === null
          ) {
            onCellPress(completedGesture.path[0] as CellKey)
            return
          }
          onPathComplete(
            completedGesture.path,
            completedGesture.invalidMessage,
          )
        }}
        onPointerCancel={(event) => {
          const gesture = gestureRef.current
          if (!gesture || gesture.pointerId !== event.pointerId) {
            return
          }

          gestureRef.current = null
          suppressNextClickRef.current = true
          globalThis.setTimeout(() => {
            suppressNextClickRef.current = false
          }, 0)
          event.currentTarget.releasePointerCapture?.(event.pointerId)
          clearGesturePresentation(event.currentTarget)
          onPathComplete([], 'Жест прерван. Попробуй ещё раз.')
        }}
      >
        {CELL_KEYS.map((cellKey) => {
          const cell = game.board[cellKey]
          const isDraft = draft?.cell === cellKey
          const letter = isDraft ? draft.letter : cell?.letter
          const lastPathOrder = lastMove?.path.indexOf(cellKey) ?? -1
          const isLastLetter = lastMove?.cell === cellKey
          const lastPathPrevious =
            lastPathOrder >= 0
              ? directionTo(cellKey, lastMove?.path[lastPathOrder - 1])
              : undefined
          const lastPathNext =
            lastPathOrder >= 0
              ? directionTo(cellKey, lastMove?.path[lastPathOrder + 1])
              : undefined
          const label = letter
            ? `Клетка ${cellKey.replace('_', ', ')}, буква ${letter}${
                isDraft ? ', черновик' : ''
              }`
            : `Пустая клетка ${cellKey.replace('_', ', ')}`

          return (
            <button
              className={[
                'board-cell',
                cell?.source === 'start' ? 'is-start' : '',
                isDraft ? 'is-draft' : '',
                lastPathOrder >= 0 ? 'is-last-path' : '',
                isLastLetter ? 'is-last-letter' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              type="button"
              role="gridcell"
              key={cellKey}
              data-cell-key={cellKey}
              data-last-prev={lastPathPrevious}
              data-last-next={lastPathNext}
              aria-label={label}
              aria-disabled={disabled}
              onClick={() => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false
                  return
                }
                onCellPress(cellKey)
              }}
            >
              <span
                className="path-arrow path-arrow-out last-path-arrow"
                aria-hidden="true"
              />
              <span
                className="path-arrow path-arrow-in last-path-arrow"
                aria-hidden="true"
              />
              <span
                className="path-arrow path-arrow-out gesture-path-arrow"
                aria-hidden="true"
              />
              <span
                className="path-arrow path-arrow-in gesture-path-arrow"
                aria-hidden="true"
              />
              <span className="board-letter" aria-hidden="true">
                {letter}
              </span>
            </button>
          )
        })}
      </div>
      <p className="gesture-hint" data-gesture-status aria-live="assertive">
        {draft
          ? 'Проведи одним движением через буквы слова'
          : 'Нажми на свободную клетку рядом с буквой'}
      </p>
    </div>
  )
}
