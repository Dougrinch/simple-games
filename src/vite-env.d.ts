/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string
declare const __APP_BUILD_TIME__: number
declare const __APP_RELEASE_ID__: number

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_DATABASE_URL: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_PUSH_WORKER_URL: string
  readonly VITE_BASE_PATH: string
  readonly VITE_USE_FIREBASE_EMULATORS?: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
