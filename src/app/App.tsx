import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  signOutCurrentUser,
  startGoogleSignIn,
  subscribeAuthSession,
  type AuthSession,
} from '../features/auth/authService'
import { PushNotificationsControl } from '../features/push/PushNotificationsControl'
import { GameScreen, type LocalDraft } from '../games/balda/components/GameScreen'
import {
  BaldaRepository,
  RepositoryError,
  type BaldaSession,
} from '../games/balda/repository'
import type { CellKey, MoveDraft, PlayerId, WordRating } from '../games/balda/types'
import { notifyOtherPlayer } from '../platform/push/pushClient'

function LoadingScreen({
  title = 'Загружаем игру',
  text = 'Проверяем аккаунт и ищем актуальную партию.',
}: {
  title?: string
  text?: string
}) {
  return (
    <main className="centered-screen">
      <section className="state-card" aria-labelledby="loading-title">
        <span className="large-spinner" aria-hidden="true" />
        <p className="eyebrow">Балда</p>
        <h1 id="loading-title">{title}</h1>
        <p role="status" aria-live="polite">
          {text}
        </p>
      </section>
    </main>
  )
}

function SignInScreen({
  message,
  onSignIn,
}: {
  message?: string
  onSignIn: () => void
}) {
  return (
    <main className="centered-screen">
      <section className="state-card hero-card" aria-labelledby="signin-title">
        <div className="letter-mark" aria-hidden="true">
          Б
        </div>
        <p className="eyebrow">Игра для своих</p>
        <h1 id="signin-title">Балда</h1>
        <p>
          Добавляй по букве, собирай слова одним движением и не давай вражине
          уйти вперёд.
        </p>
        {message && (
          <p className="action-message" role="alert">
            {message}
          </p>
        )}
        <button className="primary-button" type="button" onClick={onSignIn}>
          <span className="google-dot" aria-hidden="true">
            G
          </span>
          Войти через Google
        </button>
        <small>Доступ открыт только двум игрокам.</small>
      </section>
    </main>
  )
}

function ForbiddenScreen({
  email,
  onSignOut,
}: {
  email: string | null
  onSignOut: () => void
}) {
  return (
    <main className="centered-screen">
      <section className="state-card" aria-labelledby="forbidden-title">
        <div className="state-icon" aria-hidden="true">
          ×
        </div>
        <p className="eyebrow">Закрытая игра</p>
        <h1 id="forbidden-title">Доступ запрещён</h1>
        <p>
          Аккаунт <strong>{email ?? 'без email'}</strong> не входит в список
          игроков.
        </p>
        <button className="secondary-button" type="button" onClick={onSignOut}>
          Выйти
        </button>
      </section>
    </main>
  )
}

function ErrorScreen({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry?: () => void
}) {
  return (
    <main className="centered-screen">
      <section className="state-card" aria-labelledby="error-title">
        <div className="state-icon" aria-hidden="true">
          !
        </div>
        <p className="eyebrow">Балда</p>
        <h1 id="error-title">{title}</h1>
        <p>{message}</p>
        {onRetry && (
          <button className="primary-button" type="button" onClick={onRetry}>
            Попробовать снова
          </button>
        )}
      </section>
    </main>
  )
}

function EmptyGameScreen({
  online,
  synchronized,
  pending,
  notificationControl,
  onCreate,
  onSignOut,
}: {
  online: boolean
  synchronized: boolean
  pending: boolean
  notificationControl?: ReactNode
  onCreate: () => void
  onSignOut: () => void
}) {
  return (
    <main className="centered-screen">
      {!online && (
        <div className="offline-banner" role="status">
          Падажжи
          <small>Нет соединения</small>
        </div>
      )}
      <section className="state-card" aria-labelledby="empty-title">
        <div className="letter-mark small" aria-hidden="true">
          Я
        </div>
        <p className="eyebrow">Пока тихо</p>
        <h1 id="empty-title">
          {online ? 'Начнём партию?' : 'Игра недоступна без сети'}
        </h1>
        <p>
          {online
            ? 'Выберем случайное стартовое слово и подбросим монетку за первый ход.'
            : 'Подключись к сети — и мы загрузим актуальную партию.'}
        </p>
        <button
          className="primary-button"
          type="button"
          disabled={!online || !synchronized || pending}
          onClick={onCreate}
        >
          Новая игра
        </button>
        {notificationControl}
        <button className="text-button" type="button" onClick={onSignOut}>
          Выйти из аккаунта
        </button>
      </section>
    </main>
  )
}

function AuthorizedGame({
  playerId,
  onSignOut,
}: {
  playerId: PlayerId
  onSignOut: () => void
}) {
  const [session, setSession] = useState<BaldaSession | null>(null)
  const [fatalError, setFatalError] = useState<RepositoryError | null>(null)
  const [pendingOperation, setPendingOperation] = useState<
    'create' | 'move' | 'rollback' | 'resign' | null
  >(null)
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<LocalDraft | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const repositoryRef = useRef<BaldaRepository | null>(null)

  useEffect(() => {
    let repository: BaldaRepository

    try {
      repository = new BaldaRepository()
      repositoryRef.current = repository
    } catch (error) {
      console.error('Firebase configuration failed.', error)
      setFatalError(
        new RepositoryError(
          'Проверь настройки Firebase и перезагрузи страницу.',
          'schema',
        ),
      )
      return
    }

    const unsubscribe = repository.subscribeSession(
      playerId,
      (nextSession) => {
        setSession(nextSession)
        if (nextSession.synchronized) {
          setFatalError(null)
        }
      },
      (error) => {
        setFatalError(error)
      },
    )

    return () => {
      unsubscribe()
      repositoryRef.current = null
      setSession(null)
      setDraft(null)
    }
  }, [playerId])

  const gameId = session?.game?.id
  const gameRevision = session?.game?.revision
  useEffect(() => {
    if (
      draft &&
      pendingOperation === null &&
      (draft.gameId !== gameId ||
        draft.expectedRevision !== gameRevision ||
        session?.game?.turnPlayerId !== playerId)
    ) {
      setDraft(null)
      setKeyboardOpen(false)
    }
  }, [
    draft,
    gameId,
    gameRevision,
    pendingOperation,
    playerId,
    session?.game?.turnPlayerId,
  ])

  const resynchronize = async (repository: BaldaRepository) => {
    try {
      await repository.resync()
    } catch (error) {
      const repositoryError =
        error instanceof RepositoryError
          ? error
          : new RepositoryError(
              'Не удалось заново загрузить игру.',
              'unknown',
            )
      setFatalError(repositoryError)
    }
  }

  const markOffline = (error: unknown) => {
    if (error instanceof RepositoryError && error.kind === 'offline') {
      setSession((current) =>
        current
          ? { ...current, online: false, synchronized: false }
          : current,
      )
    }
  }

  const createGame = async () => {
    const repository = repositoryRef.current
    if (!repository || pendingOperation) {
      return
    }

    setPendingOperation('create')
    setMessage(null)
    setDraft(null)

    try {
      const game = await repository.createGame()
      setSession((current) =>
        current
          ? {
              ...current,
              game,
              fromLocalSnapshot: false,
            }
          : current,
      )
    } catch (error) {
      markOffline(error)
      const text =
        error instanceof RepositoryError
          ? error.message
          : 'Не удалось создать партию.'
      setMessage(text)
    } finally {
      setPendingOperation(null)
    }
  }

  const submitMove = async (move: MoveDraft) => {
    const repository = repositoryRef.current
    const game = session?.game
    if (!repository || !game || pendingOperation) {
      return
    }

    setPendingOperation('move')

    try {
      const confirmedGame = await repository.submitMove(
        game.id,
        playerId,
        move,
      )
      setSession((current) =>
        current ? { ...current, game: confirmedGame } : current,
      )
      setDraft(null)
      setKeyboardOpen(false)
      void notifyOtherPlayer().catch((error: unknown) => {
        console.error('Sending a turn notification failed.', error)
      })
    } catch (error) {
      markOffline(error)
      setDraft(null)
      setKeyboardOpen(false)
      if (
        error instanceof RepositoryError &&
        (error.kind === 'conflict' || error.kind === 'unknown')
      ) {
        await resynchronize(repository)
      }
    } finally {
      setPendingOperation(null)
    }
  }

  const rollback = async () => {
    const repository = repositoryRef.current
    const game = session?.game
    const lastMove = game?.moves?.[String(game.moveCount)]
    if (!repository || !game || !lastMove || pendingOperation) {
      return
    }

    setPendingOperation('rollback')
    setDraft(null)

    try {
      const confirmedGame = await repository.rollbackLastMove(
        game.id,
        playerId,
        {
          expectedRevision: game.revision,
          expectedMoveNumber: lastMove.number,
          expectedAuthorPlayerId: lastMove.authorPlayerId,
        },
      )
      setSession((current) =>
        current ? { ...current, game: confirmedGame } : current,
      )
    } catch (error) {
      markOffline(error)
      if (
        error instanceof RepositoryError &&
        (error.kind === 'conflict' || error.kind === 'unknown')
      ) {
        await resynchronize(repository)
      }
    } finally {
      setPendingOperation(null)
    }
  }

  const rateMove = async (
    moveNumber: number,
    rating: WordRating | null,
  ) => {
    const repository = repositoryRef.current
    const game = session?.game
    if (!repository || !game || pendingOperation) return
    setPendingOperation('move')
    try {
      const confirmedGame = await repository.rateMove(
        game.id,
        playerId,
        moveNumber,
        rating,
      )
      setSession((current) =>
        current ? { ...current, game: confirmedGame } : current,
      )
    } catch (error) {
      markOffline(error)
      await resynchronize(repository)
    } finally {
      setPendingOperation(null)
    }
  }

  const resign = async () => {
    const repository = repositoryRef.current
    const game = session?.game
    if (!repository || !game || pendingOperation) {
      return
    }

    setPendingOperation('resign')
    setDraft(null)
    setKeyboardOpen(false)

    try {
      const confirmedGame = await repository.resignGame(
        game.id,
        playerId,
        { expectedRevision: game.revision },
      )
      setSession((current) =>
        current ? { ...current, game: confirmedGame } : current,
      )
    } catch (error) {
      markOffline(error)
      if (
        error instanceof RepositoryError &&
        (error.kind === 'conflict' || error.kind === 'unknown')
      ) {
        await resynchronize(repository)
      }
    } finally {
      setPendingOperation(null)
    }
  }

  const nudge = () => {
    void notifyOtherPlayer('nudge').catch((error: unknown) => {
      console.error('Sending a nudge notification failed.', error)
    })
  }

  if (fatalError) {
    if (fatalError.kind === 'permission') {
      return (
        <ErrorScreen
          title="Доступ к базе запрещён"
          message="Аккаунт вошёл, но Firebase не разрешил чтение данных."
          onRetry={() => window.location.reload()}
        />
      )
    }

    if (fatalError.kind === 'schema') {
      return (
        <ErrorScreen
          title="Нужно обновление"
          message={fatalError.message}
          onRetry={() => window.location.reload()}
        />
      )
    }

    return (
      <ErrorScreen
        title="Не удалось загрузить игру"
        message={fatalError.message}
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (!session) {
    return <LoadingScreen />
  }

  if (
    !session.connectionKnown ||
    (session.online && !session.synchronized && !session.game)
  ) {
    return <LoadingScreen />
  }

  if (pendingOperation === 'create') {
    return (
      <LoadingScreen
        title="Создаём партию"
        text="Достаём слово и решаем, кто ходит первым."
      />
    )
  }

  if (!session.game) {
    return (
      <>
        <EmptyGameScreen
          online={session.online}
          synchronized={session.synchronized}
          pending={pendingOperation !== null}
          notificationControl={
            <PushNotificationsControl
              playerId={playerId}
              online={session.online}
            />
          }
          onCreate={() => void createGame()}
          onSignOut={onSignOut}
        />
        {message && (
          <div className="toast-message" role="alert">
            {message}
          </div>
        )}
      </>
    )
  }

  return (
    <GameScreen
      game={session.game}
      playerId={playerId}
      profiles={session.profiles}
      online={session.online}
      synchronized={session.synchronized}
      pending={pendingOperation !== null}
      notificationControl={
        <PushNotificationsControl
          playerId={playerId}
          online={session.online}
        />
      }
      draft={draft}
      keyboardOpen={keyboardOpen}
      onOpenKeyboard={(cell: CellKey) => {
        setDraft((current) =>
          current?.cell === cell
            ? current
            : {
                gameId: session.game?.id ?? '',
                cell,
                letter: null,
                expectedRevision: session.game?.revision ?? 0,
              },
        )
        setKeyboardOpen(true)
      }}
      onChooseLetter={(letter) => {
        setDraft((current) => (current ? { ...current, letter } : current))
        setKeyboardOpen(false)
      }}
      onCloseKeyboard={() => {
        setDraft(null)
        setKeyboardOpen(false)
      }}
      onClearDraft={() => {
        setDraft(null)
        setKeyboardOpen(false)
      }}
      onSubmitMove={(move) => void submitMove(move)}
      onRateMove={(moveNumber, rating) => void rateMove(moveNumber, rating)}
      onRollback={() => void rollback()}
      onResign={() => void resign()}
      onNudge={nudge}
      onCreateGame={() => void createGame()}
    />
  )
}

export function App() {
  const [authSession, setAuthSession] = useState<AuthSession>({
    status: 'loading',
  })
  const [signInPending, setSignInPending] = useState(false)

  useEffect(() => {
    try {
      return subscribeAuthSession(setAuthSession)
    } catch (error) {
      console.error('Firebase initialization failed.', error)
      setAuthSession({
        status: 'error',
        message: 'Проверь настройки приложения и перезагрузи страницу.',
      })
      return
    }
  }, [])

  const signIn = async () => {
    setSignInPending(true)
    try {
      await startGoogleSignIn()
    } catch (error) {
      console.error('Starting Google sign-in failed.', error)
      setAuthSession({
        status: 'signed-out',
        message: 'Не получилось открыть вход через Google.',
      })
    } finally {
      setSignInPending(false)
    }
  }

  const signOut = async () => {
    try {
      await signOutCurrentUser()
    } catch (error) {
      console.error('Signing out failed.', error)
    }
  }

  if (authSession.status === 'loading' || signInPending) {
    return <LoadingScreen title={signInPending ? 'Открываем Google' : undefined} />
  }

  if (authSession.status === 'signed-out') {
    return (
      <SignInScreen message={authSession.message} onSignIn={() => void signIn()} />
    )
  }

  if (authSession.status === 'forbidden') {
    return (
      <ForbiddenScreen
        email={authSession.email}
        onSignOut={() => void signOut()}
      />
    )
  }

  if (authSession.status === 'error') {
    return (
      <ErrorScreen
        title="Не удалось запустить игру"
        message={authSession.message}
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <AuthorizedGame
      playerId={authSession.playerId}
      onSignOut={() => void signOut()}
    />
  )
}
