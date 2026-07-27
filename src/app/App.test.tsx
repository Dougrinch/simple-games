import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthSession } from '../features/auth/authService'
import { applyMove, createInitialGame } from '../games/balda/domain'
import {
  RepositoryError,
  type BaldaSession,
} from '../games/balda/repository'
import { App } from './App'

const authMocks = vi.hoisted(() => ({
  session: { status: 'signed-out' } as AuthSession,
  listener: null as ((session: AuthSession) => void) | null,
  signIn: vi.fn<() => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
}))

const repositoryMocks = vi.hoisted(() => ({
  session: null as BaldaSession | null,
  error: null as RepositoryError | null,
  listener: null as ((session: BaldaSession) => void) | null,
  errorListener: null as ((error: RepositoryError) => void) | null,
  unsubscribe: vi.fn(),
  createGame: vi.fn(),
  submitMove: vi.fn(),
  rollbackLastMove: vi.fn(),
  resync: vi.fn(),
}))

const pushMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  enable: vi.fn(),
  notifyOtherPlayer: vi.fn(),
}))

vi.mock('../features/auth/authService', () => ({
  subscribeAuthSession: (listener: (session: AuthSession) => void) => {
    authMocks.listener = listener
    listener(authMocks.session)
    return () => {
      authMocks.listener = null
    }
  },
  startGoogleSignIn: authMocks.signIn,
  signOutCurrentUser: authMocks.signOut,
}))

vi.mock('../games/balda/repository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../games/balda/repository')>()

  class MockBaldaRepository {
    subscribeSession(
      _playerId: string,
      listener: (session: BaldaSession) => void,
      errorListener: (error: RepositoryError) => void,
    ) {
      repositoryMocks.listener = listener
      repositoryMocks.errorListener = errorListener
      if (repositoryMocks.error) {
        errorListener(repositoryMocks.error)
      } else if (repositoryMocks.session) {
        listener(repositoryMocks.session)
      }
      return repositoryMocks.unsubscribe
    }

    createGame = repositoryMocks.createGame
    submitMove = repositoryMocks.submitMove
    rollbackLastMove = repositoryMocks.rollbackLastMove
    resync = repositoryMocks.resync
  }

  return { ...actual, BaldaRepository: MockBaldaRepository }
})

vi.mock('../platform/push/pushClient', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../platform/push/pushClient')>()
  return {
    ...actual,
    getPushNotificationStatus: pushMocks.getStatus,
    enablePushNotifications: pushMocks.enable,
    notifyOtherPlayer: pushMocks.notifyOtherPlayer,
  }
})

const authorizedUser = {
  uid: 'uid-grinch131',
  email: 'grinch131@gmail.com',
} as User

function session(
  overrides: Partial<BaldaSession> = {},
): BaldaSession {
  return {
    connectionKnown: true,
    online: true,
    synchronized: true,
    game: null,
    profiles: {},
    fromLocalSnapshot: false,
    ...overrides,
  }
}

describe('App states and orchestration', () => {
  beforeEach(() => {
    authMocks.session = { status: 'signed-out' }
    authMocks.listener = null
    authMocks.signIn.mockReset().mockResolvedValue(undefined)
    authMocks.signOut.mockReset().mockResolvedValue(undefined)
    repositoryMocks.session = null
    repositoryMocks.error = null
    repositoryMocks.listener = null
    repositoryMocks.errorListener = null
    repositoryMocks.unsubscribe.mockReset()
    repositoryMocks.createGame.mockReset()
    repositoryMocks.submitMove.mockReset()
    repositoryMocks.rollbackLastMove.mockReset()
    repositoryMocks.resync.mockReset()
    pushMocks.getStatus.mockReset().mockResolvedValue('prompt')
    pushMocks.enable.mockReset().mockResolvedValue(undefined)
    pushMocks.notifyOtherPlayer.mockReset().mockResolvedValue(undefined)
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('keeps game data hidden while authentication is loading', () => {
    authMocks.session = { status: 'loading' }
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Загружаем игру' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('shows the closed sign-in screen and starts Google redirect', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Балда' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Войти через Google' }),
    )
    expect(authMocks.signIn).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('button', { name: 'Войти через Google' }),
    ).toBeEnabled()
  })

  it('shows the signed-in email on the forbidden screen', () => {
    authMocks.session = {
      status: 'forbidden',
      email: 'stranger@example.com',
    }
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Доступ запрещён' }),
    ).toBeInTheDocument()
    expect(screen.getByText('stranger@example.com')).toBeInTheDocument()
    expect(repositoryMocks.listener).toBeNull()
  })

  it('waits for the first connection result before showing an empty game', () => {
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    repositoryMocks.session = session({
      connectionKnown: false,
      online: false,
      synchronized: false,
    })
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Загружаем игру' }),
    ).toBeInTheDocument()

    act(() => {
      repositoryMocks.listener?.(session())
    })
    expect(
      screen.getByRole('heading', { name: 'Начнём партию?' }),
    ).toBeInTheDocument()
  })

  it('shows the dedicated creating state and blocks a second create', async () => {
    const user = userEvent.setup()
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    repositoryMocks.session = session()
    let resolveCreate: ((game: ReturnType<typeof createInitialGame>) => void) | null =
      null
    repositoryMocks.createGame.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Новая игра' }))
    expect(
      screen.getByRole('heading', { name: 'Создаём партию' }),
    ).toBeInTheDocument()
    expect(repositoryMocks.createGame).toHaveBeenCalledOnce()

    await act(async () => {
      resolveCreate?.(
        createInitialGame('created-game', 'БЕРЕГ', 'grinch131', 1),
      )
    })
    expect(
      screen.getByRole('grid', { name: 'Игровое поле 5 на 5' }),
    ).toBeInTheDocument()
  })

  it('shows schema and permission subscription failures without a snapshot', () => {
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    repositoryMocks.error = new RepositoryError(
      'Версия данных не поддерживается. Обнови приложение.',
      'schema',
    )
    const { unmount } = render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Нужно обновление' }),
    ).toBeInTheDocument()

    unmount()
    repositoryMocks.error = new RepositoryError(
      'Доступ к игре запрещён.',
      'permission',
    )
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Доступ к базе запрещён' }),
    ).toBeInTheDocument()
  })

  it('keeps a local snapshot read-only until reconnect resync completes', () => {
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    const localGame = createInitialGame(
      'local-game',
      'БЕРЕГ',
      'grinch131',
      1,
    )
    repositoryMocks.session = session({
      online: false,
      synchronized: false,
      game: localGame,
      fromLocalSnapshot: true,
    })
    render(<App />)

    expect(screen.getByText('Падажжи')).toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toHaveAttribute('aria-disabled', 'true')

    act(() => {
      repositoryMocks.listener?.(
        session({
          online: true,
          synchronized: false,
          game: localGame,
          fromLocalSnapshot: true,
        }),
      )
    })
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toHaveAttribute('aria-disabled', 'true')

    act(() => {
      repositoryMocks.listener?.(
        session({ game: localGame, fromLocalSnapshot: false }),
      )
    })
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toHaveAttribute('aria-disabled', 'false')
  })

  it('drops a local draft when the current game changes at the same revision', async () => {
    const user = userEvent.setup()
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    const firstGame = createInitialGame(
      'first-game',
      'БЕРЕГ',
      'grinch131',
      1,
    )
    repositoryMocks.session = session({ game: firstGame })
    render(<App />)

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    )
    await user.click(screen.getByRole('button', { name: 'Буква Ё' }))
    expect(
      screen.getByRole('gridcell', {
        name: 'Клетка 1, 0, буква Ё, черновик',
      }),
    ).toBeInTheDocument()

    act(() => {
      repositoryMocks.listener?.(
        session({
          game: createInitialGame(
            'second-game',
            'КНИГА',
            'grinch131',
            2,
          ),
        }),
      )
    })

    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Поле изменилось. Выбери букву заново.'),
    ).not.toBeInTheDocument()
  })

  it('replaces a chosen draft when another available cell is pressed', async () => {
    const user = userEvent.setup()
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    repositoryMocks.session = session({
      game: createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
    })
    render(<App />)

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    )
    await user.click(screen.getByRole('button', { name: 'Буква Ё' }))
    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 1' }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Выбор буквы' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Буква Я' }))
    expect(
      screen.getByRole('gridcell', {
        name: 'Клетка 1, 1, буква Я, черновик',
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('gridcell', {
        name: 'Клетка 1, 1, буква Я, черновик',
      }),
    )
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 1' }),
    ).toBeInTheDocument()
  })

  it('leaves no draft after letter selection is closed without a choice', async () => {
    const user = userEvent.setup()
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    repositoryMocks.session = session({
      game: createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
    })
    render(<App />)

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    )
    const backdrop = document.querySelector('.keyboard-backdrop')
    expect(backdrop).not.toBeNull()
    fireEvent.pointerDown(backdrop as HTMLElement)
    expect(
      screen.getByRole('dialog', { name: 'Выбор буквы' }),
    ).toBeInTheDocument()
    fireEvent.click(backdrop as HTMLElement)

    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 1' }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Выбор буквы' }),
    ).toBeInTheDocument()
  })

  it('notifies the other player only after a move is confirmed', async () => {
    const user = userEvent.setup()
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    const initialGame = createInitialGame(
      'game-1',
      'БЕРЕГ',
      'grinch131',
      1,
    )
    const moved = applyMove(
      initialGame,
      'grinch131',
      {
        expectedRevision: 0,
        cell: '1_0',
        letter: 'А',
        path: ['1_0', '2_0', '2_1'],
      },
      2,
    )
    if (!moved.ok) {
      throw new Error(moved.message)
    }
    repositoryMocks.session = session({ game: initialGame })
    repositoryMocks.submitMove.mockResolvedValue(moved.value)
    render(<App />)

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    )
    await user.click(screen.getByRole('button', { name: 'Буква А' }))

    const board = screen.getByRole('grid', {
      name: 'Игровое поле 5 на 5',
    })
    const draftCell = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А, черновик',
    })
    const firstStartCell = screen.getByRole('gridcell', {
      name: 'Клетка 2, 0, буква Б',
    })
    const secondStartCell = screen.getByRole('gridcell', {
      name: 'Клетка 2, 1, буква Е',
    })
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi
        .fn()
        .mockReturnValueOnce(firstStartCell)
        .mockReturnValue(secondStartCell),
    })

    fireEvent.pointerDown(draftCell, {
      pointerId: 4,
      clientX: 20,
      clientY: 80,
    })
    fireEvent.pointerMove(board, {
      pointerId: 4,
      clientX: 50,
      clientY: 150,
    })
    fireEvent.pointerMove(board, {
      pointerId: 4,
      clientX: 150,
      clientY: 150,
    })
    fireEvent.pointerUp(board, {
      pointerId: 4,
      clientX: 150,
      clientY: 150,
    })

    await vi.waitFor(() => {
      expect(repositoryMocks.submitMove).toHaveBeenCalledOnce()
      expect(pushMocks.notifyOtherPlayer).toHaveBeenCalledOnce()
    })
  })

  it('resynchronizes silently when rollback is no longer available', async () => {
    const user = userEvent.setup()
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    const moved = applyMove(
      createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
      'grinch131',
      {
        expectedRevision: 0,
        cell: '1_0',
        letter: 'А',
        path: ['1_0', '2_0', '2_1'],
      },
      2,
    )
    if (!moved.ok) {
      throw new Error(moved.message)
    }
    repositoryMocks.session = session({ game: moved.value })
    repositoryMocks.rollbackLastMove.mockRejectedValue(
      new RepositoryError(
        'Этот ход уже нельзя отменить.',
        'conflict',
        {
          ok: false,
          code: 'rollback-unavailable',
          message: 'Этот ход уже нельзя отменить.',
        },
      ),
    )
    repositoryMocks.resync.mockResolvedValue(session({ game: moved.value }))
    render(<App />)

    await user.click(
      screen.getByRole('button', { name: 'ГАААААЛЯ!!' }),
    )

    await vi.waitFor(() => {
      expect(repositoryMocks.resync).toHaveBeenCalledOnce()
    })
    expect(
      screen.queryByText('Этот ход уже нельзя отменить'),
    ).not.toBeInTheDocument()
  })

  it('locks the confirmed view when an operation reports a lost connection', async () => {
    const user = userEvent.setup()
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    const moved = applyMove(
      createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
      'grinch131',
      {
        expectedRevision: 0,
        cell: '1_0',
        letter: 'А',
        path: ['1_0', '2_0', '2_1'],
      },
      2,
    )
    if (!moved.ok) {
      throw new Error(moved.message)
    }
    repositoryMocks.session = session({ game: moved.value })
    repositoryMocks.rollbackLastMove.mockRejectedValue(
      new RepositoryError('Нет соединения.', 'offline'),
    )
    render(<App />)

    await user.click(
      screen.getByRole('button', { name: 'ГАААААЛЯ!!' }),
    )

    expect(await screen.findByText('Падажжи')).toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 0, 0' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(repositoryMocks.resync).not.toHaveBeenCalled()
  })

  it('unsubscribes and removes the game when the user signs out', () => {
    authMocks.session = {
      status: 'authorized',
      playerId: 'grinch131',
      user: authorizedUser,
    }
    repositoryMocks.session = session({
      game: createInitialGame('game-1', 'БЕРЕГ', 'grinch131', 1),
    })
    render(<App />)

    act(() => {
      authMocks.listener?.({ status: 'signed-out' })
    })

    expect(repositoryMocks.unsubscribe).toHaveBeenCalledOnce()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Войти через Google' }),
    ).toBeInTheDocument()
  })
})
