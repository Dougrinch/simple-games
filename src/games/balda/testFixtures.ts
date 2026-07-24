import { applyMove, createInitialGame, RUSSIAN_ALPHABET } from './domain'
import type { BaldaGame, CellKey, PlayerId } from './types'

const NEARLY_FULL_SEQUENCE: ReadonlyArray<{
  cell: CellKey
  neighbor: CellKey
}> = [
  { cell: '1_0', neighbor: '2_0' },
  { cell: '1_1', neighbor: '2_1' },
  { cell: '1_2', neighbor: '2_2' },
  { cell: '1_3', neighbor: '2_3' },
  { cell: '1_4', neighbor: '2_4' },
  { cell: '3_0', neighbor: '2_0' },
  { cell: '3_1', neighbor: '2_1' },
  { cell: '3_2', neighbor: '2_2' },
  { cell: '3_3', neighbor: '2_3' },
  { cell: '3_4', neighbor: '2_4' },
  { cell: '0_1', neighbor: '1_1' },
  { cell: '0_2', neighbor: '1_2' },
  { cell: '0_3', neighbor: '1_3' },
  { cell: '0_4', neighbor: '1_4' },
  { cell: '4_0', neighbor: '3_0' },
  { cell: '4_1', neighbor: '3_1' },
  { cell: '4_2', neighbor: '3_2' },
  { cell: '4_3', neighbor: '3_3' },
  { cell: '4_4', neighbor: '3_4' },
]

export function makeNearlyCompletedGame(
  id = 'nearly-completed',
): BaldaGame {
  let game = createInitialGame(id, 'БЕРЕГ', 'grinch131', 1)

  NEARLY_FULL_SEQUENCE.forEach(({ cell, neighbor }, index) => {
    const playerId = game.turnPlayerId as PlayerId
    const result = applyMove(
      game,
      playerId,
      {
        expectedRevision: game.revision,
        cell,
        letter: RUSSIAN_ALPHABET[index] as string,
        path: [cell, neighbor],
      },
      index + 2,
    )

    if (!result.ok) {
      throw new Error(`Invalid nearly-completed fixture: ${result.message}`)
    }
    game = result.value
  })

  return game
}

export function completeNearlyCompletedGame(
  game: BaldaGame,
  path: CellKey[] = ['0_0', '0_1', '1_1'],
): BaldaGame {
  const result = applyMove(
    game,
    game.turnPlayerId as PlayerId,
    {
      expectedRevision: game.revision,
      cell: '0_0',
      letter: 'Я',
      path,
    },
    100,
  )

  if (!result.ok) {
    throw new Error(`Invalid completed fixture: ${result.message}`)
  }
  return result.value
}
