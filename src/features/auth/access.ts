import type { PlayerId } from '../../games/balda/types'

export interface AuthorizedPlayer {
  playerId: PlayerId
  email: string
}

export const AUTHORIZED_PLAYERS: readonly AuthorizedPlayer[] = [
  { playerId: 'grinch131', email: 'grinch131@gmail.com' },
  { playerId: 'hinhillaa', email: 'hinhillaa@gmail.com' },
]

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US')
}

export function playerIdForEmail(email: string | null): PlayerId | null {
  if (!email) {
    return null
  }

  const normalizedEmail = normalizeEmail(email)
  return (
    AUTHORIZED_PLAYERS.find(
      (player) => player.email === normalizedEmail,
    )?.playerId ?? null
  )
}
