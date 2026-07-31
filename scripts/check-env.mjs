import { existsSync } from 'node:fs'

import { loadEnv } from 'vite'

const mode = process.argv[2]

if (mode !== 'development' && mode !== 'production') {
  console.error('Environment mode must be "development" or "production".')
  process.exit(1)
}

const ambiguousEnvFiles = ['.env', '.env.local'].filter(existsSync)

if (ambiguousEnvFiles.length > 0) {
  console.error(
    `Ambiguous environment files are not allowed: ${ambiguousEnvFiles.join(', ')}. ` +
      'Use .env.development.local or .env.production.local instead.',
  )
  process.exit(1)
}

const env = {
  ...loadEnv(mode, process.cwd(), ''),
  ...process.env,
}

const requiredVariables = [
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
]

const missingVariables = requiredVariables.filter(
  (name) => !env[name] || !env[name].trim(),
)

if (missingVariables.length > 0) {
  console.error(
    `Required environment variables are not set: ${missingVariables.join(', ')}`,
  )
  process.exitCode = 1
} else if (
  !env.VITE_BASE_PATH.startsWith('/') ||
  !env.VITE_BASE_PATH.endsWith('/')
) {
  console.error('VITE_BASE_PATH must start and end with "/".')
  process.exitCode = 1
} else if (!['true', 'false'].includes(env.VITE_USE_FIREBASE_EMULATORS)) {
  console.error('VITE_USE_FIREBASE_EMULATORS must be either "true" or "false".')
  process.exitCode = 1
} else if (
  mode === 'development' &&
  env.VITE_USE_FIREBASE_EMULATORS !== 'true'
) {
  console.error('Development mode must use Firebase Emulators.')
  process.exitCode = 1
} else if (
  mode === 'production' &&
  env.VITE_USE_FIREBASE_EMULATORS !== 'false'
) {
  console.error('Production mode must not use Firebase Emulators.')
  process.exitCode = 1
} else if (
  mode === 'development' &&
  !env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-')
) {
  console.error('Development mode must use a demo Firebase project.')
  process.exitCode = 1
} else {
  try {
    const pushWorkerUrl = new URL(env.VITE_PUSH_WORKER_URL)
    if (
      pushWorkerUrl.protocol !== 'https:' &&
      pushWorkerUrl.protocol !== 'http:'
    ) {
      throw new Error('unsupported protocol')
    }

    const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
    if (mode === 'development' && !loopbackHosts.has(pushWorkerUrl.hostname)) {
      throw new Error('non-loopback development URL')
    }

    console.log(`Environment variables for "${mode}" mode are configured.`)
  } catch {
    console.error(
      mode === 'development'
        ? 'VITE_PUSH_WORKER_URL must be a loopback HTTP(S) URL in development mode.'
        : 'VITE_PUSH_WORKER_URL must be a valid HTTP(S) URL.',
    )
    process.exitCode = 1
  }
}
