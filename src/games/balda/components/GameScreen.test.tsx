import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  applyMove,
  createInitialGame,
  resignGame,
  rollbackLastMove,
} from '../domain'
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

function thriceMovedGame() {
  const secondMove = twiceMovedGame()
  const result = applyMove(
    secondMove,
    'grinch131',
    {
      expectedRevision: 2,
      cell: '1_2',
      letter: 'Т',
      path: ['1_2', '1_1', '2_1'],
    },
    4,
  )
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result.value
}

function rolledBackGame() {
  const twiceMoved = twiceMovedGame()
  const result = rollbackLastMove(twiceMoved, 'grinch131', {
    expectedRevision: twiceMoved.revision,
    expectedMoveNumber: 2,
    expectedAuthorPlayerId: 'hinhillaa',
  })
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
    onClearDraft: vi.fn(),
    onSubmitMove: vi.fn(),
    onRateMove: vi.fn(),
    onRollback: vi.fn(),
    onResign: vi.fn(),
    onNudge: vi.fn(),
    onCreateGame: vi.fn(),
    ...overrides,
  }
}

function touchTap(element: Element, identifier: number) {
  const touch = { identifier, clientX: 10, clientY: 10 }
  fireEvent.touchStart(element, {
    touches: [touch],
    changedTouches: [touch],
  })
  fireEvent.touchEnd(element, {
    touches: [],
    changedTouches: [touch],
  })
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
        onClearDraft={vi.fn()}
        onSubmitMove={vi.fn()}
        onRollback={vi.fn()}
        onResign={vi.fn()}
        onNudge={vi.fn()}
        onCreateGame={vi.fn()}
      />,
    )

    expect(screen.queryByText(/Балда · партия/)).not.toBeInTheDocument()
    expect(screen.queryByText('Собери слово')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Выйти' }),
    ).not.toBeInTheDocument()

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
        onClearDraft={vi.fn()}
        onSubmitMove={vi.fn()}
        onRollback={vi.fn()}
        onResign={vi.fn()}
        onCreateGame={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('dialog', { name: 'Выбор буквы' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Новая клетка')).not.toBeInTheDocument()
    expect(screen.queryByText('Выбери букву')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Закрыть клавиатуру' }),
    ).not.toBeInTheDocument()
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
        onClearDraft={vi.fn()}
        onSubmitMove={vi.fn()}
        onRollback={vi.fn()}
        onResign={vi.fn()}
        onCreateGame={vi.fn()}
      />,
    )

    expect(screen.getByText('Падажжи')).toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 0' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('closes the keyboard with Escape without showing draft actions', () => {
    const onCloseKeyboard = vi.fn()
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
        })}
      />,
    )

    expect(screen.queryByText('Черновая буква')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ну, нафиг' }),
    ).not.toBeInTheDocument()

    fireEvent.keyDown(
      screen.getByRole('dialog', { name: 'Выбор буквы' }),
      { key: 'Escape' },
    )
    expect(onCloseKeyboard).toHaveBeenCalledOnce()
  })

  it('opens letter selection for another available cell over a draft', async () => {
    const user = userEvent.setup()
    const onOpenKeyboard = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          draft: {
            gameId: 'game-test',
            cell: '1_0',
            letter: 'Ё',
            expectedRevision: 0,
          },
          onOpenKeyboard,
        })}
      />,
    )

    await user.click(
      screen.getByRole('gridcell', { name: 'Пустая клетка 1, 1' }),
    )

    expect(onOpenKeyboard).toHaveBeenCalledWith('1_1')
  })

  it('clears a draft letter when its cell is tapped', async () => {
    const user = userEvent.setup()
    const onClearDraft = vi.fn()
    const onOpenKeyboard = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          draft: {
            gameId: 'game-test',
            cell: '1_0',
            letter: 'Ё',
            expectedRevision: 0,
          },
          onClearDraft,
          onOpenKeyboard,
        })}
      />,
    )

    await user.click(
      screen.getByRole('gridcell', {
        name: 'Клетка 1, 0, буква Ё, черновик',
      }),
    )

    expect(onClearDraft).toHaveBeenCalledOnce()
    expect(onOpenKeyboard).not.toHaveBeenCalled()
  })

  it('shows exact score, turn, no selected word and both rollback variants', () => {
    const moved = movedGame()
    const { rerender } = render(
      <GameScreen {...gameScreenProps({ game: moved })} />,
    )

    expect(screen.getByText('Ход вражины')).toHaveClass('is-enemy')
    expect(document.querySelector('.game-status')).not.toHaveTextContent(
      'АБЕ',
    )
    expect(document.querySelector('.highlighted-word')).not.toBeInTheDocument()
    expect(screen.getByLabelText('3 очков')).toBeInTheDocument()
    const ownRollback = screen.getByRole('button', {
      name: 'ГАААААЛЯ!!',
    })
    expect(ownRollback).toBeInTheDocument()
    expect(ownRollback.parentElement).toHaveClass('game-status')

    rerender(
      <GameScreen
        {...gameScreenProps({ game: moved, playerId: 'hinhillaa' })}
      />,
    )
    expect(screen.getByText('Мой ход')).toHaveClass('is-mine')
    expect(
      screen.getByRole('button', { name: 'низя!' }),
    ).toBeInTheDocument()
  })

  it('activates after a completed press and rates a word on its second click', async () => {
    const user = userEvent.setup()
    const onRateMove = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          game: twiceMovedGame(),
          playerId: 'hinhillaa',
          onRateMove,
        })}
      />,
    )

    const word = screen.getByRole('button', { name: 'АБЕ' })
    const firstLetter = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А',
    })
    await user.click(word)
    expect(firstLetter).toHaveClass('is-last-path', 'is-last-letter')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(word)
    expect(
      screen.getByRole('dialog', { name: 'Оценить слово АБЕ' }),
    ).toBeInTheDocument()
    fireEvent.click(document.querySelector('.rating-backdrop') as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Оценить' }),
    ).not.toBeInTheDocument()
    expect(document.querySelector('.is-last-path')).not.toBeInTheDocument()
    expect(onRateMove).not.toHaveBeenCalled()

    await user.click(word)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(word)
    await user.click(screen.getByRole('button', { name: 'Иди нахрен 🤬' }))
    expect(onRateMove).toHaveBeenCalledWith(1, 'angry')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Оценить' }),
    ).not.toBeInTheDocument()
    expect(document.querySelector('.is-last-path')).not.toBeInTheDocument()
  })

  it('uses touch targets instead of WebKit retargeted clicks', () => {
    render(
      <GameScreen
        {...gameScreenProps({
          game: thriceMovedGame(),
          playerId: 'hinhillaa',
        })}
      />,
    )

    const firstWord = screen.getByRole('button', { name: 'АБЕ' })
    const secondWord = screen.getByRole('button', { name: 'ТРЕ' })

    touchTap(firstWord, 1)
    fireEvent.click(firstWord, { detail: 1 })
    touchTap(secondWord, 2)
    fireEvent.click(firstWord, { detail: 2 })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: 'Клетка 1, 2, буква Т' }),
    ).toHaveClass('is-last-path', 'is-last-letter')
  })

  it('opens rating after two rapid touch taps on the same word', () => {
    render(
      <GameScreen
        {...gameScreenProps({
          game: thriceMovedGame(),
          playerId: 'hinhillaa',
        })}
      />,
    )

    const word = screen.getByRole('button', { name: 'АБЕ' })

    touchTap(word, 1)
    fireEvent.click(word, { detail: 1 })
    touchTap(word, 2)
    fireEvent.click(word, { detail: 2 })

    expect(
      screen.getByRole('dialog', { name: 'Оценить слово АБЕ' }),
    ).toBeInTheDocument()
  })

  it('switches rapidly between the player own words on touch', () => {
    render(
      <GameScreen {...gameScreenProps({ game: thriceMovedGame() })} />,
    )

    const firstWord = screen.getByRole('button', { name: 'ТРЕ' })
    const secondWord = screen.getByRole('button', { name: 'АБЕ' })

    touchTap(firstWord, 1)
    fireEvent.click(firstWord, { detail: 1 })
    touchTap(secondWord, 2)
    fireEvent.click(firstWord, { detail: 2 })

    expect(
      screen.getByRole('gridcell', { name: 'Клетка 1, 0, буква А' }),
    ).toHaveClass('is-last-path', 'is-last-letter')
  })

  it('switches between enemy words without rating the previous selection', () => {
    render(
      <GameScreen
        {...gameScreenProps({
          game: thriceMovedGame(),
          playerId: 'hinhillaa',
        })}
      />,
    )

    const firstWord = screen.getByRole('button', { name: 'АБЕ' })
    const secondWord = screen.getByRole('button', { name: 'ТРЕ' })

    act(() => {
      firstWord.click()
      secondWord.click()
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: 'Клетка 1, 2, буква Т' }),
    ).toHaveClass('is-last-path', 'is-last-letter')
  })

  it('keeps native button semantics for keyboard activation', async () => {
    const user = userEvent.setup()
    render(
      <GameScreen
        {...gameScreenProps({
          game: thriceMovedGame(),
          playerId: 'hinhillaa',
        })}
      />,
    )

    const firstWord = screen.getByRole('button', { name: 'АБЕ' })
    const secondWord = screen.getByRole('button', { name: 'ТРЕ' })
    const firstLetter = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А',
    })
    const secondLetter = screen.getByRole('gridcell', {
      name: 'Клетка 1, 2, буква Т',
    })

    expect(firstWord.tagName).toBe('BUTTON')
    expect(firstWord).toHaveAttribute('type', 'button')

    firstWord.focus()
    await user.keyboard('{Enter}')
    expect(firstLetter).toHaveClass('is-last-path', 'is-last-letter')

    secondWord.focus()
    await user.keyboard(' ')
    expect(secondLetter).toHaveClass('is-last-path', 'is-last-letter')

    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('dialog', { name: 'Оценить слово ТРЕ' }),
    ).toBeInTheDocument()
  })

  it('restarts the selection timer when another word is selected', () => {
    vi.useFakeTimers()

    try {
      render(
        <GameScreen
          {...gameScreenProps({
            game: thriceMovedGame(),
            playerId: 'hinhillaa',
          })}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'АБЕ' }))
      act(() => vi.advanceTimersByTime(1_000))
      fireEvent.click(screen.getByRole('button', { name: 'ТРЕ' }))
      act(() => vi.advanceTimersByTime(2_000))
      fireEvent.click(screen.getByRole('button', { name: 'ТРЕ' }))

      expect(
        screen.getByRole('dialog', { name: 'Оценить слово ТРЕ' }),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not allow a player to rate their own word', () => {
    const onRateMove = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          game: movedGame(),
          playerId: 'grinch131',
          onRateMove,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'АБЕ' }))
    expect(
      screen.queryByRole('button', { name: 'Оценить' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onRateMove).not.toHaveBeenCalled()
  })

  it('pauses the selected word timer while rating and clears the selection on close', () => {
    vi.useFakeTimers()

    try {
      render(
        <GameScreen
          {...gameScreenProps({
            game: twiceMovedGame(),
            playerId: 'hinhillaa',
          })}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'АБЕ' }))
      fireEvent.click(screen.getByRole('button', { name: 'АБЕ' }))
      expect(
        screen.getByRole('dialog', { name: 'Оценить слово АБЕ' }),
      ).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(30_000)
      })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(
        screen.getByRole('gridcell', {
          name: 'Клетка 1, 0, буква А',
        }),
      ).toHaveClass('is-last-path', 'is-last-letter')
      expect(
        screen.queryByRole('button', { name: 'Оценить' }),
      ).not.toBeInTheDocument()

      fireEvent.click(document.querySelector('.rating-backdrop') as HTMLElement)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Оценить' }),
      ).not.toBeInTheDocument()
      expect(document.querySelector('.is-last-path')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens a popup for a saved rating and removes it on confirmation', async () => {
    const user = userEvent.setup()
    const onRateMove = vi.fn()
    const ratedGame = movedGame()
    const move = ratedGame.moves?.['1']
    if (!move) throw new Error('Expected the first move.')
    move.rating = 'bad'

    render(
      <GameScreen
        {...gameScreenProps({
          game: ratedGame,
          playerId: 'hinhillaa',
          onRateMove,
        })}
      />,
    )

    expect(screen.getByRole('region', { name: 'История ходов' })).toHaveTextContent(
      'АБЕ 🙄',
    )
    expect(screen.queryByText(/Хуйня/u)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'АБЕ 🙄' }))

    expect(
      screen.getByRole('dialog', { name: 'Отменить оценку слова АБЕ' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Это была ошибка!' }))

    expect(onRateMove).toHaveBeenCalledWith(1, null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.is-last-path')).not.toBeInTheDocument()
  })

  it('keeps selected words on the board and out of the status row', () => {
    vi.useFakeTimers()

    try {
      render(
        <GameScreen
          {...gameScreenProps({
            game: twiceMovedGame(),
            playerId: 'grinch131',
          })}
        />,
      )

      const status = document.querySelector('.game-status')
      const secondMoveLetter = screen.getByRole('gridcell', {
        name: 'Клетка 1, 1, буква Р',
      })
      expect(status).not.toHaveTextContent('РЕР')
      expect(secondMoveLetter).toHaveClass('is-last-path', 'is-last-letter')

      fireEvent.click(screen.getByRole('button', { name: 'АБЕ' }))

      expect(status).not.toHaveTextContent('РЕР')
      expect(status).not.toHaveTextContent('АБЕ')
      expect(
        screen.getByRole('gridcell', {
          name: 'Клетка 1, 0, буква А',
        }),
      ).toHaveClass('is-last-path', 'is-last-letter')

      act(() => {
        vi.advanceTimersByTime(3_000)
      })

      expect(document.querySelector('.is-last-path')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets the selected word when the game changes', () => {
    vi.useFakeTimers()

    try {
      const { rerender } = render(
        <GameScreen
          {...gameScreenProps({
            game: twiceMovedGame(),
            playerId: 'grinch131',
          })}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'АБЕ' }))
      expect(
        screen.getByRole('gridcell', {
          name: 'Клетка 1, 0, буква А',
        }),
      ).toHaveClass('is-last-path', 'is-last-letter')

      rerender(
        <GameScreen
          {...gameScreenProps({
            game: { ...twiceMovedGame(), id: 'next-game' },
            playerId: 'grinch131',
          })}
        />,
      )

      expect(
        screen.getByRole('gridcell', {
          name: 'Клетка 1, 0, буква А',
        }),
      ).not.toHaveClass('is-last-path', 'is-last-letter')
      expect(
        screen.getByRole('gridcell', {
          name: 'Клетка 1, 1, буква Р',
        }),
      ).toHaveClass('is-last-path', 'is-last-letter')
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the highlighted word instead of selecting the previous move after rollback', () => {
    const { rerender } = render(
      <GameScreen
        {...gameScreenProps({
          game: twiceMovedGame(),
          playerId: 'grinch131',
        })}
      />,
    )

    rerender(
      <GameScreen
        {...gameScreenProps({
          game: rolledBackGame(),
          playerId: 'grinch131',
        })}
      />,
    )

    expect(document.querySelector('.is-last-path')).not.toBeInTheDocument()
    expect(document.querySelector('.is-last-letter')).not.toBeInTheDocument()
  })

  it('shows each player words newest first in an unlabeled visual column', () => {
    render(
      <GameScreen
        {...gameScreenProps({
          game: thriceMovedGame(),
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
    const firstPlayerColumn = columns.item(0)
    const secondPlayerColumn = columns.item(1)

    expect(columns).toHaveLength(2)
    expect(firstPlayerColumn).toHaveAttribute(
      'aria-label',
      'Ходы игрока Гринч',
    )
    expect(firstPlayerColumn).not.toHaveTextContent('Гринч')
    expect(
      Array.from(firstPlayerColumn.querySelectorAll('li'), (item) =>
        item.textContent,
      ),
    ).toEqual(['ТРЕ', 'АБЕ'])
    expect(firstPlayerColumn).not.toHaveTextContent('РЕР')
    expect(secondPlayerColumn).toHaveAttribute(
      'aria-label',
      'Ходы игрока Хинхилла',
    )
    expect(secondPlayerColumn).not.toHaveTextContent('Хинхилла')
    expect(secondPlayerColumn).toHaveTextContent('РЕР')
    expect(secondPlayerColumn).not.toHaveTextContent('АБЕ')
  })

  it('does not offer a second consecutive rollback', () => {
    const rolledBack = rolledBackGame()
    const { rerender } = render(
      <GameScreen
        {...gameScreenProps({
          game: rolledBack,
          playerId: 'grinch131',
        })}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'ГАААААЛЯ!!' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'низя!' }),
    ).not.toBeInTheDocument()

    rerender(
      <GameScreen
        {...gameScreenProps({
          game: rolledBack,
          playerId: 'hinhillaa',
        })}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'ГАААААЛЯ!!' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'низя!' }),
    ).not.toBeInTheDocument()
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

    expect(screen.getByText('Победил hinhillaa')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'ГАААААЛЯ!!' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Новая игра' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Сдаться' }),
    ).not.toBeInTheDocument()
  })

  it('hides surrender behind the turn button regardless of turn', () => {
    const moved = movedGame()
    render(
      <GameScreen
        {...gameScreenProps({
          game: moved,
          playerId: 'grinch131',
        })}
      />,
    )

    const history = screen.getByRole('region', { name: 'История ходов' })
    const turn = screen.getByRole('button', { name: 'Ход вражины' })

    expect(turn.parentElement).toHaveClass('game-status')
    expect(history.nextElementSibling).toBeNull()
    expect(document.querySelector('.surrender-button')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Сдаться' }),
    ).not.toBeInTheDocument()
    expect(turn).toBeEnabled()
  })

  it('reveals surrender on the first press and requires confirmation on the second', async () => {
    const user = userEvent.setup()
    const onResign = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          playerId: 'hinhillaa',
          onResign,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Ход вражины' }))
    expect(
      screen.queryByRole('dialog', { name: 'Точно сдаёшься?' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сдаться' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Точно сдаёшься?',
    })
    expect(dialog).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Ну уж нет!' }),
    )
    expect(onResign).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('dialog', { name: 'Точно сдаёшься?' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ход вражины' }))
    await user.click(screen.getByRole('button', { name: 'Сдаться' }))
    await user.click(screen.getByRole('button', { name: 'Сдаюся' }))
    expect(onResign).toHaveBeenCalledOnce()
  })

  it('reveals a nudge beside surrender during the opponent turn', async () => {
    const user = userEvent.setup()
    const onNudge = vi.fn()
    render(
      <GameScreen
        {...gameScreenProps({
          game: movedGame(),
          playerId: 'grinch131',
          onNudge,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Ход вражины' }))

    const surrender = screen.getByRole('button', { name: 'Сдаться' })
    const nudge = screen.getByRole('button', { name: 'Пнуть вражину' })
    expect(surrender.parentElement).toBe(nudge.parentElement)

    await user.click(nudge)

    expect(onNudge).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('button', { name: 'Пнуть вражину' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ход вражины' }),
    ).toBeInTheDocument()
  })

  it('only reveals surrender during the current player turn', async () => {
    const user = userEvent.setup()
    render(<GameScreen {...gameScreenProps()} />)

    await user.click(screen.getByRole('button', { name: 'Мой ход' }))

    expect(
      screen.getByRole('button', { name: 'Сдаться' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Пнуть вражину' }),
    ).not.toBeInTheDocument()
  })

  it('returns to the turn label if surrender is not pressed for three seconds', () => {
    vi.useFakeTimers()

    try {
      render(<GameScreen {...gameScreenProps()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Мой ход' }))
      expect(
        screen.getByRole('button', { name: 'Сдаться' }),
      ).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2_999)
      })
      expect(
        screen.getByRole('button', { name: 'Сдаться' }),
      ).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(
        screen.getByRole('button', { name: 'Мой ход' }),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('disables the turn action while the game cannot mutate', () => {
    const { rerender } = render(
      <GameScreen
        {...gameScreenProps({
          online: false,
          synchronized: false,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Мой ход' })).toBeDisabled()

    rerender(<GameScreen {...gameScreenProps({ pending: true })} />)
    expect(screen.getByRole('button', { name: 'Мой ход' })).toBeDisabled()
  })

  it('explains a resignation to both players', () => {
    const resigned = resignGame(
      game(),
      'grinch131',
      { expectedRevision: 0 },
      2,
    )
    if (!resigned.ok) {
      throw new Error(resigned.message)
    }

    const { rerender } = render(
      <GameScreen
        {...gameScreenProps({
          game: resigned.value,
          playerId: 'grinch131',
        })}
      />,
    )
    expect(screen.getByText('Поражение. Ты сдался.')).toBeInTheDocument()

    rerender(
      <GameScreen
        {...gameScreenProps({
          game: resigned.value,
          playerId: 'hinhillaa',
        })}
      />,
    )
    expect(screen.getByText('Победа! Вражина сдалась.')).toBeInTheDocument()
  })

  it('validates and submits a complete move immediately on pointer release', () => {
    const onSubmitMove = vi.fn()
    const onClearDraft = vi.fn()
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
          onClearDraft,
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
    expect(onClearDraft).not.toHaveBeenCalled()
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
  it('renders the selected move supplied by the screen', () => {
    const { rerender } = render(
      <GameBoard
        game={movedGame()}
        selectedMoveNumber={1}
        draft={null}
        disabled
        onCellPress={vi.fn()}
        onPathComplete={vi.fn()}
      />,
    )

    const firstMoveLetter = screen.getByRole('gridcell', {
      name: 'Клетка 1, 0, буква А',
    })
    expect(firstMoveLetter).toHaveClass('is-last-path', 'is-last-letter')
    expect(document.querySelectorAll('.is-last-path')).toHaveLength(3)

    rerender(
      <GameBoard
        game={twiceMovedGame()}
        selectedMoveNumber={2}
        draft={null}
        disabled
        onCellPress={vi.fn()}
        onPathComplete={vi.fn()}
      />,
    )

    const secondMoveLetter = screen.getByRole('gridcell', {
      name: 'Клетка 1, 1, буква Р',
    })
    expect(secondMoveLetter).toHaveClass('is-last-path', 'is-last-letter')
  })

  it('does not select a word when a board letter is tapped', () => {
    vi.useFakeTimers()

    try {
      const onCellPress = vi.fn()
      render(
        <GameBoard
          game={twiceMovedGame()}
          selectedMoveNumber={2}
          draft={null}
          disabled
          onCellPress={onCellPress}
          onPathComplete={vi.fn()}
        />,
      )

      const firstMoveLetter = screen.getByRole('gridcell', {
        name: 'Клетка 1, 0, буква А',
      })
      const secondMoveLetter = screen.getByRole('gridcell', {
        name: 'Клетка 1, 1, буква Р',
      })
      expect(secondMoveLetter).toHaveClass('is-last-path', 'is-last-letter')

      fireEvent.click(firstMoveLetter)

      expect(onCellPress).toHaveBeenCalledWith('1_0')
      expect(firstMoveLetter).not.toHaveClass('is-last-path', 'is-last-letter')
      expect(secondMoveLetter).toHaveClass('is-last-path', 'is-last-letter')
      expect(document.querySelectorAll('.is-last-path')).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps letter taps in word-building mode reserved for path selection', () => {
    vi.useFakeTimers()

    try {
      const onCellPress = vi.fn()
      render(
        <GameBoard
          game={twiceMovedGame()}
          draft={{ cell: '0_1', letter: 'К' }}
          disabled={false}
          onCellPress={onCellPress}
          onPathComplete={vi.fn()}
        />,
      )

      act(() => {
        vi.advanceTimersByTime(3_000)
      })

      const firstMoveLetter = screen.getByRole('gridcell', {
        name: 'Клетка 1, 0, буква А',
      })
      fireEvent.click(firstMoveLetter)

      expect(onCellPress).toHaveBeenCalledWith('1_0')
      expect(firstMoveLetter).not.toHaveClass(
        'is-last-path',
        'is-last-letter',
      )
      expect(document.querySelector('.is-last-path')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

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

  it('suppresses a delayed mobile click after a completed pointer tap', () => {
    vi.useFakeTimers()

    try {
      const onCellPress = vi.fn()
      render(
        <GameBoard
          game={game()}
          draft={{ cell: '1_0', letter: 'А' }}
          disabled={false}
          onCellPress={onCellPress}
          onPathComplete={vi.fn()}
        />,
      )

      const board = screen.getByRole('grid', {
        name: 'Игровое поле 5 на 5',
      })
      const draftCell = screen.getByRole('gridcell', {
        name: 'Клетка 1, 0, буква А, черновик',
      })

      fireEvent.pointerDown(draftCell, {
        pointerId: 8,
        clientX: 20,
        clientY: 80,
      })
      fireEvent.pointerUp(board, {
        pointerId: 8,
        clientX: 20,
        clientY: 80,
      })
      expect(onCellPress).toHaveBeenCalledOnce()

      act(() => {
        vi.advanceTimersByTime(300)
      })
      fireEvent.click(draftCell)

      expect(onCellPress).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
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
    expect(draftCell).toHaveClass('is-path-invalid')
    expect(screen.queryByText(/Ошибка: Буквы должны/u)).not.toBeInTheDocument()
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
