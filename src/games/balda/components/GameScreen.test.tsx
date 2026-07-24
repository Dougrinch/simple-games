import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { applyMove, createInitialGame } from '../domain'
import {
  completeNearlyCompletedGame,
  makeNearlyCompletedGame,
} from '../testFixtures'
import type { CellKey } from '../types'
import { GameBoard } from './GameBoard'
import { GameScreen } from './GameScreen'

function game() {
  return createInitialGame('game-test', 'БЕРЕГ', 'grinch131', 1)
}

function movedGame() {
  const result = applyMove(
    game(),
    'grinch131',
    {
      expectedRevision: 0,
      cell: '1_0',
      letter: 'А',
      path: ['1_0', '2_0', '2_1'],
    },
    2,
  )
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result.value
}

function twiceMovedGame() {
  const firstMove = movedGame()
  const result = applyMove(
    firstMove,
    'hinhillaa',
    {
      expectedRevision: 1,
      cell: '1_1',
      letter: 'Р',
      path: ['1_1', '2_1', '2_2'],
    },
    3,
  )
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result.value
}

function gameScreenProps(
  overrides: Partial<ComponentProps<typeof GameScreen>> = {},
): ComponentProps<typeof GameScreen> {
  return {
    game: game(),
    playerId: 'grinch131',
    profiles: {},
    online: true,
    synchronized: true,
    pending: false,
    draft: null,
    keyboardOpen: false,
    onOpenKeyboard: vi.fn(),
    onChooseLetter: vi.fn(),
    onCloseKeyboard: vi.fn(),
    onCancelDraft: vi.fn(),
    onSubmitMove: vi.fn(),
    onRollback: vi.fn(),
    onCreateGame: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
}

describe('GameScreen', () => {
  it('opens the Russian keyboard and lets the player choose a draft letter', async () => {
    const user = userEvent.setup()
    const onOpenKeyboard = vi.fn()
    const onChooseLetter = vi.fn()

    const { rerender } = render(
      <GameScreen
        game={game()}
        playerId="grinch131"
        profiles={{}}
        online
        synchronized
        pending={false}
        draft={null}
        keyboardOpen={false}
        onOpenKeyboard={onOpenKeyboard}
        onChooseLetter={onChooseLetter}
        onCloseKeyboard={vi.fn()}
        onCancelDraft={vi.fn()}
        onSubmitMove={vi.fn()}
        onRollback={vi.fn()}
        onCreateGame={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    )
    expect(onOpenKeyboard).toHaveBeenCalledWith('1_0')

    rerender(
      <GameScreen
        game={game()}
        playerId="grinch131"
        profiles={{}}
        online
        synchronized
        pending={false}
        draft={{
          gameId: 'game-test',
          cell: '1_0',
          letter: null,
          expectedRevision: 0,
        }}
        keyboardOpen
        onOpenKeyboard={onOpenKeyboard}
        onChooseLetter={onChooseLetter}
        onCloseKeyboard={vi.fn()}
        onCancelDraft={vi.fn()}
        onSubmitMove={vi.fn()}
        onRollback={vi.fn()}
        onCreateGame={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('dialog', { name: 'Выбери букву' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Буква /u })).toHaveLength(33)
    expect(screen.getByRole('button', { name: 'Буква А' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Буква Ё' }))
    expect(onChooseLetter).toHaveBeenCalledWith('Ё')
  })

  it('keeps the confirmed board read-only while offline', () => {
    render(
      <GameScreen
        game={game()}
        playerId="grinch131"
        profiles={{}}
        online={false}
        synchronized={false}
        pending={false}
        draft={null}
        keyboardOpen={false}
        onOpenKeyboard={vi.fn()}
        onChooseLetter={vi.fn()}
        onCloseKeyboard={vi.fn()}
        onCancelDraft={vi.fn()}
        onSubmitMove={vi.fn()}
        onRollback={vi.fn()}
        onCreateGame={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    expect(screen.getByText('Падажжи')).toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('closes the keyboard with Escape and cancels the whole draft', async () => {
    const user = userEvent.setup()
    const onCloseKeyboard = vi.fn()
    const onCancelDraft = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          keyboardOpen: true,
          draft: {
            gameId: 'game-test',
            cell: '1_0',
            letter: 'Ё',
            expectedRevision: 0,
          },
          onCloseKeyboard,
          onCancelDraft,
        })}
      />,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCloseKeyboard).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Ну, нафиг' }))
    expect(onCancelDraft).toHaveBeenCalledOnce()
  })

  it('shows exact score, turn, last word and both rollback variants', () => {
    const moved = movedGame()
    const { rerender } = render(
      <GameScreen {...gameScreenProps({ game: moved })} />,
    )

    expect(screen.getByText('Ход вражины')).toBeInTheDocument()
    expect(document.querySelector('.game-status')).toHaveTextContent('АБЕ')
    expect(screen.getByLabelText('3 очков')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ой, шучушучу' }),
    ).toBeInTheDocument()

    rerender(
      <GameScreen
        {...gameScreenProps({ game: moved, playerId: 'hinhillaa' })}
      />,
    )
    expect(screen.getByText('Мой ход')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ненене, так нельзя' }),
    ).toBeInTheDocument()
  })

  it('shows each player words in a separate move-history column', () => {
    render(
      <GameScreen
        {...gameScreenProps({
          game: twiceMovedGame(),
          profiles: {
            grinch131: {
              playerId: 'grinch131',
              uid: 'grinch-uid',
              email: 'grinch@example.com',
              displayName: 'Гринч',
              photoURL: null,
              lastSeenAt: 1,
            },
            hinhillaa: {
              playerId: 'hinhillaa',
              uid: 'hinhillaa-uid',
              email: 'hinhillaa@example.com',
              displayName: 'Хинхилла',
              photoURL: null,
              lastSeenAt: 1,
            },
          },
        })}
      />,
    )

    const history = screen.getByRole('region', { name: 'История ходов' })
    const columns = history.querySelectorAll('.move-history-column')

    expect(columns).toHaveLength(2)
    expect(columns[0]).toHaveTextContent('Гринч')
    expect(columns[0]).toHaveTextContent('АБЕ')
    expect(columns[0]).not.toHaveTextContent('РЕР')
    expect(columns[1]).toHaveTextContent('Хинхилла')
    expect(columns[1]).toHaveTextContent('РЕР')
    expect(columns[1]).not.toHaveTextContent('АБЕ')
  })

  it('ignores board actions while pending or when a cell is unavailable', async () => {
    const user = userEvent.setup()
    const onOpenKeyboard = vi.fn()
    const { rerender } = render(
      <GameScreen
        {...gameScreenProps({ pending: true, onOpenKeyboard })}
      />,
    )

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    )
    expect(onOpenKeyboard).not.toHaveBeenCalled()

    rerender(<GameScreen {...gameScreenProps({ onOpenKeyboard })} />)
    await user.click(
      screen.getByRole('gridcell', { name: 'Клетка 2, 0, буква Б' }),
    )
    expect(onOpenKeyboard).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 0, 0' }),
    )
    expect(onOpenKeyboard).not.toHaveBeenCalled()
  })

  it('renders the completed result without rollback and allows a new game', () => {
    const completed = completeNearlyCompletedGame(
      makeNearlyCompletedGame('completed-game'),
    )
    render(<GameScreen {...gameScreenProps({ game: completed })} />)

    expect(
      screen.getByRole('heading', { name: 'Партия окончена' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Победил hinhillaa')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ой, шучушучу' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Новая игра' }),
    ).toBeEnabled()
  })

  it('validates and submits a complete move immediately on pointer release', () => {
    const onSubmitMove = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          draft: {
            gameId: 'game-test',
            cell: '1_0',
            letter: 'А',
            expectedRevision: 0,
          },
          onSubmitMove,
        })}
      />,
    )

    const board = screen.getByRole('grid', { name: 'Игровое поле 5 на 5' })
    const draftCell = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А, черновик',
    })
    const firstStartCell = screen.getByRole('gridcell', {
      name: 'Клетка 2, 0, буква Б',
    })
    const secondStartCell = screen.getByRole('gridcell', {
      name: 'Клетка 2, 1, буква Е',
    })
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 300,
      top: 0,
      bottom: 300,
      width: 300,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi
        .fn()
        .mockReturnValueOnce(firstStartCell)
        .mockReturnValue(secondStartCell),
    })

    fireEvent.pointerDown(draftCell, { pointerId: 4, clientX: 20, clientY: 80 })
    fireEvent.pointerMove(board, { pointerId: 4, clientX: 50, clientY: 150 })
    fireEvent.pointerMove(board, { pointerId: 4, clientX: 150, clientY: 150 })
    fireEvent.pointerUp(board, { pointerId: 4, clientX: 150, clientY: 150 })

    expect(onSubmitMove).toHaveBeenCalledWith({
      expectedRevision: 0,
      cell: '1_0',
      letter: 'А',
      path: ['1_0', '2_0', '2_1'],
    })
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('keeps the game status accessible without a transient status panel', () => {
    render(<GameScreen {...gameScreenProps({ pending: true })} />)

    expect(
      screen.getByRole('grid', { name: 'Игровое поле 5 на 5' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Секундочку…')).not.toBeInTheDocument()
    expect(document.querySelector('.action-message')).not.toBeInTheDocument()
    expect(document.querySelector('.pending-message')).not.toBeInTheDocument()
    expect(screen.getByText('Мой ход').closest('[aria-live]')).not.toBeNull()
  })
})

describe('GameBoard pointer path', () => {
  it('submits the ordered path immediately on pointer release', () => {
    const onPathComplete = vi.fn()
    const onCellPress = vi.fn()
    render(
      <GameBoard
        game={game()}
        draft={{ cell: '1_0', letter: 'А' }}
        disabled={false}
        onCellPress={onCellPress}
        onPathComplete={onPathComplete}
      />,
    )

    const board = screen.getByRole('grid', { name: 'Игровое поле 5 на 5' })
    const draftCell = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А, черновик',
    })
    const firstStartCell = screen.getByRole('gridcell', {
      name: 'Клетка 2, 0, буква Б',
    })
    const secondStartCell = screen.getByRole('gridcell', {
      name: 'Клетка 2, 1, буква Е',
    })

    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 300,
      top: 0,
      bottom: 300,
      width: 300,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const elementFromPoint = vi.fn((x: number) =>
      x < 100 ? firstStartCell : secondStartCell,
    )
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    })

    fireEvent.pointerDown(draftCell, {
      pointerId: 7,
      clientX: 20,
      clientY: 80,
    })
    fireEvent.pointerMove(board, {
      pointerId: 7,
      clientX: 50,
      clientY: 150,
    })
    fireEvent.pointerMove(board, {
      pointerId: 7,
      clientX: 150,
      clientY: 150,
    })

    expect(draftCell).toHaveAttribute('data-path-next', 'down')
    expect(firstStartCell).toHaveAttribute('data-path-prev', 'up')
    expect(firstStartCell).toHaveAttribute('data-path-next', 'right')
    expect(secondStartCell).toHaveAttribute('data-path-prev', 'left')
    expect(firstStartCell).not.toHaveAttribute('data-path-order')

    fireEvent.pointerUp(board, {
      pointerId: 7,
      clientX: 150,
      clientY: 150,
    })

    expect(onPathComplete).toHaveBeenCalledWith(
      ['1_0', '2_0', '2_1'] satisfies CellKey[],
      null,
    )
    fireEvent.click(draftCell)
    expect(onCellPress).not.toHaveBeenCalled()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('reports a concrete invalid swipe and never submits it as valid', () => {
    const onPathComplete = vi.fn()
    render(
      <GameBoard
        game={game()}
        draft={{ cell: '1_0', letter: 'А' }}
        disabled={false}
        onCellPress={vi.fn()}
        onPathComplete={onPathComplete}
      />,
    )

    const board = screen.getByRole('grid', { name: 'Игровое поле 5 на 5' })
    const draftCell = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А, черновик',
    })
    const nonAdjacentCell = screen.getByRole('gridcell', {
      name: 'Клетка 2, 2, буква Р',
    })
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 300,
      top: 0,
      bottom: 300,
      width: 300,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => nonAdjacentCell,
    })

    fireEvent.pointerDown(draftCell, { pointerId: 9, clientX: 20, clientY: 80 })
    fireEvent.pointerMove(board, { pointerId: 9, clientX: 150, clientY: 150 })
    expect(screen.getByText(/Ошибка: Буквы должны/u)).toBeInTheDocument()
    fireEvent.pointerUp(board, { pointerId: 9, clientX: 150, clientY: 150 })

    expect(onPathComplete).toHaveBeenCalledWith(
      ['1_0'],
      'Буквы должны стоять рядом по стороне.',
    )
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('ignores gaps and empty cells until the pointer reaches a letter', () => {
    const onPathComplete = vi.fn()
    render(
      <GameBoard
        game={game()}
        draft={{ cell: '1_0', letter: 'А' }}
        disabled={false}
        onCellPress={vi.fn()}
        onPathComplete={onPathComplete}
      />,
    )

    const board = screen.getByRole('grid', { name: 'Игровое поле 5 на 5' })
    const draftCell = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А, черновик',
    })
    const emptyCell = screen.getByRole('gridcell', {
      name: 'Пустая клетка 1, 1',
    })
    const nextLetter = screen.getByRole('gridcell', {
      name: 'Клетка 2, 0, буква Б',
    })
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi
        .fn()
        .mockReturnValueOnce(board)
        .mockReturnValueOnce(emptyCell)
        .mockReturnValue(nextLetter),
    })

    fireEvent.pointerDown(draftCell, {
      pointerId: 11,
      clientX: 20,
      clientY: 80,
    })
    fireEvent.pointerMove(board, {
      pointerId: 11,
      clientX: 60,
      clientY: 80,
    })
    fireEvent.pointerMove(board, {
      pointerId: 11,
      clientX: 90,
      clientY: 80,
    })

    expect(screen.queryByText(/^Ошибка:/u)).not.toBeInTheDocument()
    expect(board).toHaveAttribute('data-path', '1_0')

    fireEvent.pointerMove(board, {
      pointerId: 11,
      clientX: 50,
      clientY: 150,
    })
    fireEvent.pointerUp(board, {
      pointerId: 11,
      clientX: 50,
      clientY: 150,
    })

    expect(onPathComplete).toHaveBeenCalledWith(
      ['1_0', '2_0'] satisfies CellKey[],
      null,
    )
    Reflect.deleteProperty(document, 'elementFromPoint')
  })
})
