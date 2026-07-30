import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const PRODUCT_ENV_NAMES = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_BASE_PATH',
  'VITE_USE_FIREBASE_EMULATORS',
  'VITE_PUSH_WORKER_URL',
  'VITE_BUILD_ID',
] as const

for (const name of PRODUCT_ENV_NAMES) {
  delete process.env[name]
}

export default defineConfig({
  envDir: false,
  define: {
    __APP_BUILD_ID__: JSON.stringify('unit-test'),
    __APP_BUILD_TIME__: JSON.stringify(0),
    __APP_RELEASE_ID__: JSON.stringify(1),
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    env: {
      VITE_FIREBASE_API_KEY: 'unit-test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'auth.example.test',
      VITE_FIREBASE_DATABASE_URL: 'https://firebase.example.test/',
      VITE_FIREBASE_PROJECT_ID: 'demo-unit-test',
      VITE_FIREBASE_STORAGE_BUCKET: 'storage.example.test',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: 'unit-test-app',
      VITE_USE_FIREBASE_EMULATORS: 'false',
      VITE_PUSH_WORKER_URL: 'https://push.example.test/',
    },
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
})
