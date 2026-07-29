import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { canRollbackLastMove, isAvailableCell, validateMove } from '../domain'
import type {
  BaldaGame,
  CellKey,
  MoveDraft,
  PlayerId,
  WordRating,
} from '../types'
import type { PlayerProfile } from '../repository'
import { GameBoard } from './GameBoard'
import { RussianKeyboard } from './RussianKeyboard'

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
  onRateMove?: (moveNumber: number, rating: WordRating) => void
  onRollback: () => void
  onResign: () => void
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
  return null
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
  onCreateGame,
}: GameScreenProps) {
  const isActive = game.status === 'active'
  const isMyTurn = isActive && game.turnPlayerId === playerId
  const canAct = isActive && isMyTurn && online && synchronized && !pending
  const canResign = isActive && online && synchronized && !pending
  const [resignationOpen, setResignationOpen] = useState(false)
  const [resignationArmed, setResignationArmed] = useState(false)
  const [selectedMoveNumber, setSelectedMoveNumber] = useState<number | null>(
    game.moveCount || null,
  )
  const [selectedMoveRequest, setSelectedMoveRequest] = useState<{
    gameId: string
    moveNumber: number | null
    requestId: number
  } | null>(null)
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
  const canRate = Boolean(
    selectedMove &&
      selectedMove.authorPlayerId !== playerId &&
      !selectedMove.rating &&
      online &&
      synchronized &&
      !pending,
  )
  const rateSelectedMove = (rating: WordRating) => {
    if (!selectedMove || selectedMove.authorPlayerId === playerId) {
      return
    }
    setRatingOpen(false)
    onRateMove(selectedMove.number, rating)
  }
  const selectMove = useCallback((moveNumber: number | null) => {
    setSelectedMoveNumber(moveNumber)
    setSelectedMoveRequest((request) => ({
      gameId: game.id,
      moveNumber,
      requestId: (request?.requestId ?? 0) + 1,
    }))
  }, [game.id])

  useEffect(() => {
    setResignationOpen(false)
    setResignationArmed(false)
    setRatingOpen(false)
    setSelectedMoveNumber(game.moveCount || null)
    setSelectedMoveRequest(null)
  }, [game.id, game.status])

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
      selectedMove.authorPlayerId === playerId ||
      selectedMove.rating
    ) {
      setRatingOpen(false)
    }
  }, [playerId, selectedMove])

  useEffect(() => {
    if (ratingWasOpenRef.current && !ratingOpen) {
      selectMove(null)
    }
    ratingWasOpenRef.current = ratingOpen
  }, [ratingOpen, selectMove])

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
            <button
              className={`turn-pill turn-action ${
                resignationArmed
                  ? 'is-surrender'
                  : isMyTurn
                    ? 'is-mine'
                    : 'is-enemy'
              }`}
              type="button"
              disabled={!canResign}
              onClick={() => {
                if (resignationArmed) {
                  setResignationArmed(false)
                  setResignationOpen(true)
                  return
                }

                setResignationArmed(true)
              }}
            >
              {resignationArmed
                ? 'Сдаться'
                : isMyTurn
                  ? 'Мой ход'
                  : 'Ход вражины'}
            </button>
            {canRate && (
              <button
                className="secondary-button rating-button"
                type="button"
                onClick={() => setRatingOpen(true)}
              >
                Оценить
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
              return
            }

            onSubmitMove(move)
          }}
          onSelectedMoveChange={setSelectedMoveNumber}
          selectedMoveRequest={selectedMoveRequest ?? undefined}
          selectedMoveTimerPaused={ratingOpen}
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
                      <button
                        className="move-history-word"
                        type="button"
                        onClick={() => selectMove(move.number)}
                      >
                        {move.word}
                        {emoji && ` ${emoji}`}
                      </button>
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
                      <button
                        className="move-history-word"
                        type="button"
                        onClick={() => selectMove(move.number)}
                      >
                        {move.word}
                        {emoji && ` ${emoji}`}
                      </button>
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
        selectedMove.authorPlayerId !== playerId &&
        !selectedMove.rating && (
        <div className="rating-backdrop" onClick={() => setRatingOpen(false)}>
          <section
            className="rating-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Оценить слово ${selectedMove.word}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => rateSelectedMove('bad')}>
              Хуйня 🙄
            </button>
            <button type="button" onClick={() => rateSelectedMove('great')}>
              Охуенно ❤️
            </button>
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
