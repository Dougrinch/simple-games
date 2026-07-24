import { GoogleAuthProvider } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { startGoogleSignIn } from './authService'

const authMocks = vi.hoisted(() => ({
  auth: { currentUser: null },
  signInWithPopup: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  onAuthStateChanged: vi.fn(),
  signInWithPopup: authMocks.signInWithPopup,
  signOut: vi.fn(),
}))

vi.mock('../../platform/firebase/client', () => ({
  getFirebaseServices: () => ({
    auth: authMocks.auth,
    database: {},
  }),
}))

describe('Google authentication', () => {
  beforeEach(() => {
    authMocks.signInWithPopup.mockReset().mockResolvedValue(undefined)
  })

  it('signs in with a popup without leaving the application', async () => {
    await startGoogleSignIn()

    expect(authMocks.signInWithPopup).toHaveBeenCalledWith(
      authMocks.auth,
      expect.any(GoogleAuthProvider),
    )
  })
})
