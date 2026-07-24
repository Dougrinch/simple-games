import { loadEnv } from 'vite'

const mode = process.argv[2] || 'production'
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
} else {
  console.log(`Environment variables for "${mode}" mode are configured.`)
}
