import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchList as ReactTouchList,
} from 'react'

import {
  buildWord,
  canRollbackLastMove,
  isAvailableCell,
  validateMove,
} from '../domain'
import type {
  BaldaGame,
  BaldaMove,
  CellKey,
  MoveDraft,
  PlayerId,
  WordRating,
} from '../types'
import type { PlayerProfile } from '../repository'
import { GameBoard } from './GameBoard'
import { RussianKeyboard } from './RussianKeyboard'

const MOVE_HIGHLIGHT_DURATION_MS = 3_000
const TOUCH_TAP_MOVEMENT_THRESHOLD_PX = 10
const TOUCH_CLICK_SUPPRESSION_MS = 1_000

export interface LocalDraft {
  gameId: string
  cell: CellKey
  letter: string | null
  expectedRevision: number
}

interface GameScreenProps {
  game: BaldaGame
  playerId: PlayerId
  profiles: Partial<Record<PlayerId, PlayerProfile>>
  online: boolean
  synchronized: boolean
  pending: boolean
  notificationControl?: ReactNode
  draft: LocalDraft | null
  keyboardOpen: boolean
  onOpenKeyboard: (cell: CellKey) => void
  onChooseLetter: (letter: string) => void
  onCloseKeyboard: () => void
  onClearDraft: () => void
  onSubmitMove: (draft: MoveDraft) => void
  onRateMove?: (moveNumber: number, rating: WordRating | null) => void
  onRollback: () => void
  onResign: () => void
  onNudge?: () => void
  onCreateGame: () => void
}

function playerName(
  playerId: PlayerId,
  profiles: Partial<Record<PlayerId, PlayerProfile>>,
): string {
  return profiles[playerId]?.displayName ?? playerId
}

function ratingEmoji(rating: WordRating | undefined): string | null {
  if (rating === 'bad') return '🙄'
  if (rating === 'great') return '❤️'
  if (rating === 'angry') return '🤬'
  if (rating === 'terrible') return '😱'
  return null
}

function MoveHistoryWord({
  move,
  emoji,
  onActivate,
}: {
  move: BaldaMove
  emoji: string | null
  onActivate: (move: BaldaMove) => void
}) {
  const touchStartRef = useRef<{
    identifier: number
    clientX: number
    clientY: number
  } | null>(null)
  const suppressClicksUntilRef = useRef(0)
  const activate = () => onActivate(move)
  const findTouch = (touches: ReactTouchList, identifier: number) => {
    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches[index]
      if (touch?.identifier === identifier) {
        return touch
      }
    }

    return null
  }
  const movedPastTapThreshold = (clientX: number, clientY: number) => {
    const touchStart = touchStartRef.current
    return (
      !touchStart ||
      Math.hypot(
        clientX - touchStart.clientX,
        clientY - touchStart.clientY,
      ) > TOUCH_TAP_MOVEMENT_THRESHOLD_PX
    )
  }

  return (
    <button
      className="move-history-word"
      type="button"
      onClick={(event) => {
        if (
          event.detail > 0 &&
          Date.now() < suppressClicksUntilRef.current
        ) {
          event.preventDefault()
          return
        }

        activate()
      }}
      onTouchStart={(event) => {
        if (event.touches.length !== 1) {
          touchStartRef.current = null
          return
        }

        const touch = event.touches[0]
        touchStartRef.current = touch
          ? {
              identifier: touch.identifier,
              clientX: touch.clientX,
              clientY: touch.clientY,
            }
          : null
      }}
      onTouchMove={(event) => {
        const touchStart = touchStartRef.current
        if (!touchStart || event.touches.length !== 1) {
          touchStartRef.current = null
          return
        }

        const touch = findTouch(event.touches, touchStart.identifier)
        if (
          !touch ||
          movedPastTapThreshold(touch.clientX, touch.clientY)
        ) {
          touchStartRef.current = null
        }
      }}
      onTouchEnd={(event) => {
        const touchStart = touchStartRef.current
        touchStartRef.current = null
        if (!touchStart) {
          return
        }

        const touch = findTouch(event.changedTouches, touchStart.identifier)
        if (
          !touch ||
          Math.hypot(
            touch.clientX - touchStart.clientX,
            touch.clientY - touchStart.clientY,
          ) > TOUCH_TAP_MOVEMENT_THRESHOLD_PX
        ) {
          return
        }

        // React registers a delegated dblclick listener. On iOS, WebKit can
        // consequently retarget a rapid second click to the first button.
        // Activating from the real touch target and cancelling its synthetic
        // click avoids that WebKit path while retaining mouse and keyboard use.
        event.preventDefault()
        suppressClicksUntilRef.current = Date.now() + TOUCH_CLICK_SUPPRESSION_MS
        activate()
      }}
      onTouchCancel={() => {
        touchStartRef.current = null
      }}
    >
      {move.word}
      {emoji && ` ${emoji}`}
    </button>
  )
}

export function GameScreen({
  game,
  playerId,
  profiles,
  online,
  synchronized,
  pending,
  notificationControl,
  draft,
  keyboardOpen,
  onOpenKeyboard,
  onChooseLetter,
  onCloseKeyboard,
  onClearDraft,
  onSubmitMove,
  onRateMove = () => undefined,
  onRollback,
  onResign,
  onNudge = () => undefined,
  onCreateGame,
}: GameScreenProps) {
  const isActive = game.status === 'active'
  const isMyTurn = isActive && game.turnPlayerId === playerId
  const canAct = isActive && isMyTurn && online && synchronized && !pending
  const canResign = isActive && online && synchronized && !pending
  const [resignationOpen, setResignationOpen] = useState(false)
  const [resignationArmed, setResignationArmed] = useState(false)
  const [selectedMoveNumber, setSelectedMoveNumber] = useState<number | null>(
    game.moveCount && game.rollbackTargetMoveNumber === game.moveCount
      ? game.moveCount
      : null,
  )
  const selectedMoveNumberRef = useRef(selectedMoveNumber)
  const selectionTimerRef = useRef<
    ReturnType<typeof globalThis.setTimeout> | undefined
  >(undefined)
  const [ratingOpen, setRatingOpen] = useState(false)
  const ratingWasOpenRef = useRef(false)
  const moves = Object.values(game.moves ?? {}).sort(
    (first, second) => second.number - first.number,
  )
  const lastMove = game.moves?.[String(game.moveCount)]
  const showRollback =
    online &&
    synchronized &&
    !pending &&
    canRollbackLastMove(game, playerId)
  const rollbackLabel =
    lastMove?.authorPlayerId === playerId
      ? 'ГАААААЛЯ!!'
      : 'низя!'
  const selectedMove = selectedMoveNumber
    ? game.moves?.[String(selectedMoveNumber)]
    : undefined
  const canRateMove = (move: BaldaMove | undefined) =>
    Boolean(
      move &&
        move.authorPlayerId !== playerId &&
        online &&
        synchronized &&
        !pending,
    )
  const rateSelectedMove = (rating: WordRating | null) => {
    if (!selectedMove || selectedMove.authorPlayerId === playerId) {
      return
    }
    setRatingOpen(false)
    onRateMove(selectedMove.number, rating)
  }
  const clearSelectionTimer = useCallback(() => {
    if (selectionTimerRef.current !== undefined) {
      globalThis.clearTimeout(selectionTimerRef.current)
      selectionTimerRef.current = undefined
    }
  }, [])
  const clearSelectedMove = useCallback(() => {
    clearSelectionTimer()
    selectedMoveNumberRef.current = null
    setSelectedMoveNumber(null)
  }, [clearSelectionTimer])
  const selectMove = useCallback((moveNumber: number) => {
    clearSelectionTimer()
    selectedMoveNumberRef.current = moveNumber
    setSelectedMoveNumber(moveNumber)
    selectionTimerRef.current = globalThis.setTimeout(() => {
      selectedMoveNumberRef.current = null
      setSelectedMoveNumber(null)
      selectionTimerRef.current = undefined
    }, MOVE_HIGHLIGHT_DURATION_MS)
  }, [clearSelectionTimer])
  const activateMove = (move: BaldaMove) => {
    if (selectedMoveNumberRef.current === move.number && canRateMove(move)) {
      clearSelectionTimer()
      setRatingOpen(true)
      return
    }

    selectMove(move.number)
  }

  useEffect(() => {
    setResignationOpen(false)
    setResignationArmed(false)
    setRatingOpen(false)
    if (
      game.moveCount &&
      game.rollbackTargetMoveNumber === game.moveCount
    ) {
      selectMove(game.moveCount)
    } else {
      clearSelectedMove()
    }
  }, [
    clearSelectedMove,
    game.id,
    game.moveCount,
    game.rollbackTargetMoveNumber,
    game.status,
    selectMove,
  ])

  useEffect(() => clearSelectionTimer, [clearSelectionTimer])

  useEffect(() => {
    if (!resignationArmed) {
      return
    }

    const timeout = globalThis.setTimeout(() => {
      setResignationArmed(false)
    }, 3_000)

    return () => globalThis.clearTimeout(timeout)
  }, [resignationArmed])

  useEffect(() => {
    if (
      !selectedMove ||
      selectedMove.authorPlayerId === playerId
    ) {
      setRatingOpen(false)
    }
  }, [playerId, selectedMove])

  useEffect(() => {
    if (ratingWasOpenRef.current && !ratingOpen) {
      clearSelectedMove()
    }
    ratingWasOpenRef.current = ratingOpen
  }, [clearSelectedMove, ratingOpen])

  return (
    <main className="game-page">
      {!online && (
        <div className="offline-banner" role="status" aria-live="assertive">
          <span aria-hidden="true">◌</span>
          Падажжи
          <small>Нет связи — пока только смотрим</small>
        </div>
      )}

      <section className="scoreboard" aria-label="Счёт игроков">
        {game.playerIds.map((scorePlayerId) => {
          const isCurrentPlayer = scorePlayerId === playerId
          const hasTurn =
            game.status === 'active' && game.turnPlayerId === scorePlayerId

          return (
            <article
              className={`score-card ${hasTurn ? 'has-turn' : ''}`}
              key={scorePlayerId}
            >
              <div>
                <span className="player-name">
                  {playerName(scorePlayerId, profiles)}
                </span>
                <small>{isCurrentPlayer ? 'это ты' : 'вражина'}</small>
              </div>
              <strong aria-label={`${game.scores[scorePlayerId]} очков`}>
                {game.scores[scorePlayerId]}
              </strong>
            </article>
          )
        })}
      </section>

      {notificationControl}

      <section className="game-status" aria-live="polite">
        {game.status === 'active' ? (
          <>
            {resignationArmed ? (
              <div className="turn-actions">
                <button
                  className="turn-pill turn-action is-surrender"
                  type="button"
                  onClick={() => {
                    setResignationArmed(false)
                    setResignationOpen(true)
                  }}
                >
                  Сдаться
                </button>
                {!isMyTurn && (
                  <button
                    className="turn-pill turn-action is-nudge"
                    type="button"
                    onClick={() => {
                      setResignationArmed(false)
                      onNudge()
                    }}
                  >
                    Пнуть вражину
                  </button>
                )}
              </div>
            ) : (
              <button
                className={`turn-pill turn-action ${
                  isMyTurn ? 'is-mine' : 'is-enemy'
                }`}
                type="button"
                disabled={!canResign}
                onClick={() => setResignationArmed(true)}
              >
                {isMyTurn ? 'Мой ход' : 'Ход вражины'}
              </button>
            )}
            {showRollback && (
              <button
                className="danger-button rollback-button"
                type="button"
                onClick={onRollback}
              >
                {rollbackLabel}
              </button>
            )}
          </>
        ) : (
          <div className="final-result">
            <span className="turn-pill">Финиш</span>
            <p>
              {game.result?.completionReason === 'resignation'
                ? game.result.resignedByPlayerId === playerId
                  ? 'Поражение. Ты сдался.'
                  : 'Победа! Вражина сдалась.'
                : game.result?.isDraw
                  ? 'Ничья. Красиво разошлись.'
                  : game.result?.winnerPlayerId === playerId
                    ? 'Ты победил!'
                    : `Победил ${playerName(
                        game.result?.winnerPlayerId ?? game.playerIds[0],
                        profiles,
                      )}`}
            </p>
          </div>
        )}
      </section>

      <div className="board-stage">
        <GameBoard
          game={game}
          draft={
            draft?.letter ? { cell: draft.cell, letter: draft.letter } : null
          }
          disabled={!canAct}
          onCellPress={(cell) => {
            if (!canAct) {
              return
            }

            if (draft?.cell === cell) {
              onClearDraft()
              return
            }

            if (game.board[cell]) {
              return
            }

            if (!isAvailableCell(game.board, cell)) {
              return
            }

            onOpenKeyboard(cell)
          }}
          onPathComplete={(path, invalidMessage) => {
            if (invalidMessage) {
              return
            }

            if (!draft?.letter) {
              return
            }

            const move: MoveDraft = {
              expectedRevision: draft.expectedRevision,
              cell: draft.cell,
              letter: draft.letter,
              path,
            }
            const result = validateMove(game, playerId, move)

            if (!result.ok) {
              if (result.code === 'word-already-used') {
                onClearDraft()
                const repeatedWord = buildWord(
                  game.board,
                  move.cell,
                  move.letter,
                  move.path,
                )
                const repeatedMove = repeatedWord.ok
                  ? moves.find(({ word }) => word === repeatedWord.value)
                  : undefined

                if (repeatedMove) {
                  selectMove(repeatedMove.number)
                }
              }
              return
            }

            onSubmitMove(move)
          }}
          selectedMoveNumber={selectedMoveNumber}
        />
      </div>

      {game.status === 'completed' && (
        <button
          className="primary-button"
          type="button"
          disabled={!online || !synchronized || pending}
          onClick={onCreateGame}
        >
          Новая игра
        </button>
      )}

      {moves.length > 0 && (
        <section className="move-history" aria-label="История ходов">
          <div
            className="move-history-column"
            aria-label={`Ходы игрока ${playerName(game.playerIds[0], profiles)}`}
          >
            <ol>
              {moves
                .filter(
                  (move) => move.authorPlayerId === game.playerIds[0],
                )
                .map((move) => {
                  const emoji = ratingEmoji(move.rating)
                  return (
                    <li key={move.number}>
                      <MoveHistoryWord
                        move={move}
                        emoji={emoji}
                        onActivate={activateMove}
                      />
                    </li>
                  )
                })}
            </ol>
          </div>
          <div
            className="move-history-column"
            aria-label={`Ходы игрока ${playerName(game.playerIds[1], profiles)}`}
          >
            <ol>
              {moves
                .filter(
                  (move) => move.authorPlayerId === game.playerIds[1],
                )
                .map((move) => {
                  const emoji = ratingEmoji(move.rating)
                  return (
                    <li key={move.number}>
                      <MoveHistoryWord
                        move={move}
                        emoji={emoji}
                        onActivate={activateMove}
                      />
                    </li>
                  )
                })}
            </ol>
          </div>
        </section>
      )}

      {game.status === 'active' && resignationOpen && (
        <div className="confirmation-backdrop">
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resignation-title"
          >
            <h2 id="resignation-title">Точно сдаёшься?</h2>
            <div className="confirmation-actions">
              <button
                className="danger-button"
                type="button"
                disabled={!online || !synchronized || pending}
                onClick={onResign}
              >
                Сдаюся
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={pending}
                autoFocus
                onClick={() => setResignationOpen(false)}
              >
                Ну уж нет!
              </button>
            </div>
          </section>
        </div>
      )}

      {ratingOpen &&
        selectedMove &&
        selectedMove.authorPlayerId !== playerId && (
        <div className="rating-backdrop" onClick={() => setRatingOpen(false)}>
          <section
            className="rating-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              selectedMove.rating
                ? `Отменить оценку слова ${selectedMove.word}`
                : `Оценить слово ${selectedMove.word}`
            }
            onClick={(event) => event.stopPropagation()}
          >
            {selectedMove.rating ? (
              <button type="button" onClick={() => rateSelectedMove(null)}>
                Это была ошибка!
              </button>
            ) : (
              <>
                <button type="button" onClick={() => rateSelectedMove('bad')}>
                  Хуйня 🙄
                </button>
                <button type="button" onClick={() => rateSelectedMove('great')}>
                  Охуенно ❤️
                </button>
                <button type="button" onClick={() => rateSelectedMove('angry')}>
                  Иди нахрен 🤬
                </button>
                <button type="button" onClick={() => rateSelectedMove('terrible')}>
                  Ужас 😱
                </button>
              </>
            )}
          </section>
        </div>
      )}

      <RussianKeyboard
        open={keyboardOpen}
        onChoose={onChooseLetter}
        onClose={onCloseKeyboard}
      />
    </main>
  )
}
