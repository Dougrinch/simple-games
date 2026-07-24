import { canRollbackLastMove, isAvailableCell, validateMove } from '../domain'
import type {
  BaldaGame,
  CellKey,
  MoveDraft,
  PlayerId,
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
  draft: LocalDraft | null
  keyboardOpen: boolean
  onOpenKeyboard: (cell: CellKey) => void
  onChooseLetter: (letter: string) => void
  onCloseKeyboard: () => void
  onCancelDraft: () => void
  onSubmitMove: (draft: MoveDraft) => void
  onRollback: () => void
  onCreateGame: () => void
  onSignOut: () => void
}

function playerName(
  playerId: PlayerId,
  profiles: Partial<Record<PlayerId, PlayerProfile>>,
): string {
  return profiles[playerId]?.displayName ?? playerId
}

export function GameScreen({
  game,
  playerId,
  profiles,
  online,
  synchronized,
  pending,
  draft,
  keyboardOpen,
  onOpenKeyboard,
  onChooseLetter,
  onCloseKeyboard,
  onCancelDraft,
  onSubmitMove,
  onRollback,
  onCreateGame,
  onSignOut,
}: GameScreenProps) {
  const isActive = game.status === 'active'
  const isMyTurn = isActive && game.turnPlayerId === playerId
  const canAct = isActive && isMyTurn && online && synchronized && !pending
  const moves = Object.values(game.moves ?? {}).sort(
    (first, second) => first.number - second.number,
  )
  const lastMove = game.moves?.[String(game.moveCount)]
  const showRollback =
    online &&
    synchronized &&
    !pending &&
    canRollbackLastMove(game, playerId)
  const rollbackLabel =
    lastMove?.authorPlayerId === playerId
      ? 'Ой, шучушучу'
      : 'Ненене, так нельзя'

  return (
    <main className="game-page">
      {!online && (
        <div className="offline-banner" role="status" aria-live="assertive">
          <span aria-hidden="true">◌</span>
          Падажжи
          <small>Нет связи — пока только смотрим</small>
        </div>
      )}

      <header className="game-header">
        <div>
          <p className="eyebrow">Балда · партия {game.id.slice(-5)}</p>
          <h1>{game.status === 'active' ? 'Собери слово' : 'Партия окончена'}</h1>
        </div>
        <button
          className="text-button"
          type="button"
          disabled={pending}
          onClick={onSignOut}
        >
          Выйти
        </button>
      </header>

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

      <section className="game-status" aria-live="polite">
        {game.status === 'active' ? (
          <>
            <span className={`turn-pill ${isMyTurn ? 'is-mine' : ''}`}>
              {isMyTurn ? 'Мой ход' : 'Ход вражины'}
            </span>
            <p>
              Последнее слово <strong>{game.lastWord}</strong>
            </p>
          </>
        ) : (
          <div className="final-result">
            <span className="turn-pill">Финиш</span>
            <p>
              {game.result?.isDraw
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
            onOpenKeyboard(cell)
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
      />

      {draft && (
        <div className="draft-actions" aria-label="Действия с черновиком">
          <div>
            <span>Черновая буква</span>
            <strong>{draft.letter ?? 'не выбрана'}</strong>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={pending}
            onClick={onCancelDraft}
          >
            Ну, нафиг
          </button>
        </div>
      )}

      {showRollback && (
        <button
          className="danger-button"
          type="button"
          onClick={onRollback}
        >
          {rollbackLabel}
        </button>
      )}

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
          <div className="move-history-column">
            <h2>{playerName(game.playerIds[0], profiles)}</h2>
            <ol>
              {moves
                .filter(
                  (move) => move.authorPlayerId === game.playerIds[0],
                )
                .map((move) => (
                  <li key={move.number}>{move.word}</li>
                ))}
            </ol>
          </div>
          <div className="move-history-column">
            <h2>{playerName(game.playerIds[1], profiles)}</h2>
            <ol>
              {moves
                .filter(
                  (move) => move.authorPlayerId === game.playerIds[1],
                )
                .map((move) => (
                  <li key={move.number}>{move.word}</li>
                ))}
            </ol>
          </div>
        </section>
      )}

      <RussianKeyboard
        open={keyboardOpen}
        onChoose={onChooseLetter}
        onClose={onCloseKeyboard}
      />
    </main>
  )
}
