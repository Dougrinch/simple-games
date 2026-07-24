import { FirebaseError } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import { get, ref } from 'firebase/database'

import { getFirebaseServices } from './client'

const START_WORD_COUNT_PATH = 'dictionaries/balda/startWords/count'
const LOCAL_USER_EMAIL = 'grinch131@gmail.com'
const LOCAL_USER_PASSWORD = 'local-emulator-password'
const MISSING_USER_ERROR_CODES = new Set([
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/user-not-found',
])

let startWordCountRequest: Promise<number> | undefined

export function isFirebaseEmulatorMode(): boolean {
  return import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
}

function hasFirebaseErrorCode(
  error: unknown,
  expectedCodes: ReadonlySet<string>,
): error is FirebaseError {
  return error instanceof FirebaseError && expectedCodes.has(error.code)
}

async function ensureLocalEmulatorUser(auth: Auth): Promise<void> {
  if (auth.currentUser?.email === LOCAL_USER_EMAIL) {
    return
  }

  if (auth.currentUser) {
    await signOut(auth)
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      LOCAL_USER_EMAIL,
      LOCAL_USER_PASSWORD,
    )
  } catch (error) {
    if (!hasFirebaseErrorCode(error, MISSING_USER_ERROR_CODES)) {
      throw error
    }

    try {
      await createUserWithEmailAndPassword(
        auth,
        LOCAL_USER_EMAIL,
        LOCAL_USER_PASSWORD,
      )
    } catch (createError) {
      const emailAlreadyExists = new Set(['auth/email-already-in-use'])

      if (!hasFirebaseErrorCode(createError, emailAlreadyExists)) {
        throw createError
      }

      await signInWithEmailAndPassword(
        auth,
        LOCAL_USER_EMAIL,
        LOCAL_USER_PASSWORD,
      )
    }
  }
}

async function runStartWordCountCheck(): Promise<number> {
  if (!isFirebaseEmulatorMode()) {
    throw new Error('The Firebase connection check is emulator-only.')
  }

  const { auth, database } = getFirebaseServices()
  await ensureLocalEmulatorUser(auth)

  const snapshot = await get(ref(database, START_WORD_COUNT_PATH))
  const count: unknown = snapshot.val()

  if (!Number.isInteger(count) || (count as number) < 0) {
    throw new Error('The starting-word count is missing or invalid.')
  }

  return count as number
}

export function readStartWordCountFromEmulator(): Promise<number> {
  startWordCountRequest ??= runStartWordCountCheck()
  return startWordCountRequest
}
