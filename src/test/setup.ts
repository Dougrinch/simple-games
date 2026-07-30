import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, vi } from 'vitest'

const EXPECTED_UNIT_ENV = {
  VITE_FIREBASE_API_KEY: 'unit-test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'auth.example.test',
  VITE_FIREBASE_DATABASE_URL: 'https://firebase.example.test/',
  VITE_FIREBASE_PROJECT_ID: 'demo-unit-test',
  VITE_FIREBASE_STORAGE_BUCKET: 'storage.example.test',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: 'unit-test-app',
  VITE_USE_FIREBASE_EMULATORS: 'false',
  VITE_PUSH_WORKER_URL: 'https://push.example.test/',
} as const

beforeAll(() => {
  for (const [name, expected] of Object.entries(EXPECTED_UNIT_ENV)) {
    const actual: unknown = import.meta.env[name]
    if (actual !== expected) {
      throw new Error(
        `Unit test environment ${name} must be isolated from local configuration.`,
      )
    }
  }
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) =>
      Promise.reject(
        new Error(`Unexpected network request in unit test: ${String(input)}`),
      ),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
