export interface GameDefinition {
  id: string
  schemaVersion: number
  rootPath: string
}

export const GAME_DEFINITIONS = {
  balda: {
    id: 'balda',
    schemaVersion: 1,
    rootPath: 'gameTypes/balda',
  },
} as const satisfies Record<string, GameDefinition>

export type GameTypeId = keyof typeof GAME_DEFINITIONS

export function getGameDefinition(gameTypeId: GameTypeId): GameDefinition {
  return GAME_DEFINITIONS[gameTypeId]
}
