import { FirebaseError } from 'firebase/app'
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { ref, serverTimestamp, set } from 'firebase/database'

import type { PlayerId } from '../../games/balda/types'
import { getFirebaseServices } from '../../platform/firebase/client'
import { playerIdForEmail } from './access'

export type AuthSession =
  | { status: 'loading' }
  | { status: 'signed-out'; message?: string }
  | { status: 'forbidden'; email: string | null }
  | { status: 'authorized'; playerId: PlayerId; user: User }
  | { status: 'error'; message: string }

const SILENT_REDIRECT_ERRORS = new Set([
  'auth/redirect-cancelled-by-user',
  'auth/cancelled-popup-request',
  'auth/popup-closed-by-user',
])

let redirectResultCheck: Promise<string | null> | null = null

function isSilentRedirectError(error: unknown): boolean {
  return (
    error instanceof FirebaseError && SILENT_REDIRECT_ERRORS.has(error.code)
  )
}

async function saveOwnProfile(user: User, playerId: PlayerId): Promise<void> {
  const { database } = getFirebaseServices()
  const email = user.email?.trim().toLocaleLowerCase('en-US')

  if (!email) {
    return
  }

  const profile: Record<string, unknown> = {
    playerId,
    uid: user.uid,
    email,
    lastSeenAt: serverTimestamp(),
  }

  if (user.displayName) {
    profile.displayName = user.displayName
  }

  if (user.photoURL) {
    profile.photoURL = user.photoURL
  }

  await set(ref(database, `profiles/${playerId}`), profile)
}

export function subscribeAuthSession(
  listener: (session: AuthSession) => void,
): () => void {
  const { auth } = getFirebaseServices()
  let active = true
  let redirectErrorMessage: string | undefined

  redirectResultCheck ??= getRedirectResult(auth)
    .then(() => null)
    .catch((error: unknown) => {
      if (isSilentRedirectError(error)) {
        return null
      }
      console.error('Google redirect sign-in failed.', error)
      return 'Не получилось войти. Попробуй ещё раз.'
    })

  void redirectResultCheck.then((message) => {
    if (!active || !message) {
      return
    }
    redirectErrorMessage = message
    if (!auth.currentUser) {
      listener({ status: 'signed-out', message })
    }
  })

  const unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      if (!active) {
        return
      }

      if (!user) {
        listener({ status: 'signed-out', message: redirectErrorMessage })
        return
      }

      const playerId = playerIdForEmail(user.email)

      if (!playerId) {
        listener({ status: 'forbidden', email: user.email })
        return
      }

      listener({ status: 'authorized', playerId, user })
      void saveOwnProfile(user, playerId).catch((error: unknown) => {
        console.error('Saving the current player profile failed.', error)
      })
    },
    (error) => {
      console.error('Firebase authentication state failed.', error)
      if (active) {
        listener({
          status: 'error',
          message: 'Не удалось проверить аккаунт. Перезагрузи страницу.',
        })
      }
    },
  )

  return () => {
    active = false
    unsubscribe()
  }
}

export async function startGoogleSignIn(): Promise<void> {
  const { auth } = getFirebaseServices()
  await setPersistence(auth, browserLocalPersistence)
  await signInWithRedirect(auth, new GoogleAuthProvider())
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(getFirebaseServices().auth)
}
