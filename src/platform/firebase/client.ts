import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from 'firebase/auth'
import {
  connectDatabaseEmulator,
  getDatabase,
  type Database,
} from 'firebase/database'

export interface FirebaseServices {
  auth: Auth
  database: Database
}

const REQUIRED_FIREBASE_ENV = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'VITE_FIREBASE_DATABASE_URL',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const

function getFirebaseOptions(): FirebaseOptions {
  return Object.fromEntries(
    Object.entries(REQUIRED_FIREBASE_ENV).map(([option, envName]) => {
      const configuredValue: unknown = import.meta.env[envName]
      const value =
        typeof configuredValue === 'string' ? configuredValue.trim() : ''

      if (!value) {
        throw new Error(`Required environment variable ${envName} is not set.`)
      }

      return [option, value]
    }),
  )
}

let services: FirebaseServices | undefined

export function getFirebaseServices(): FirebaseServices {
  if (services) {
    return services
  }

  const appAlreadyExists = getApps().length > 0
  const app = appAlreadyExists ? getApp() : initializeApp(getFirebaseOptions())
  const auth = getAuth(app)
  const database = getDatabase(app)

  if (
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
    !appAlreadyExists
  ) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
    connectDatabaseEmulator(database, '127.0.0.1', 9000)
  }

  services = { auth, database }
  return services
}
