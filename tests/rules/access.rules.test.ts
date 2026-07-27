import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFile } from 'node:fs/promises'
import {
  get,
  ref,
  remove,
  set,
} from 'firebase/database'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  it,
} from 'vitest'

const PROJECT_ID = 'demo-simple-games'
const ALLOWED_EMAILS = [
  'grinch131@gmail.com',
  'hinhillaa@gmail.com',
] as const
const DENIED_EMAIL = 'stranger@example.com'

let testEnvironment: RulesTestEnvironment

async function seedDatabase() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database()), {
      meta: { schemaVersion: 1 },
      dictionaries: {
        balda: {
          startWords: {
            count: 100,
            items: { 0: 'БЕРЕГ' },
          },
        },
      },
      gameTypes: {
        balda: {
          games: {
            existing: { status: 'completed' },
          },
        },
      },
    })
  })
}

beforeAll(async () => {
  const rules = await readFile(
    new URL('../../database.rules.json', import.meta.url),
    'utf8',
  )

  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules },
  })

  await seedDatabase()
})

afterEach(async () => {
  await testEnvironment.clearDatabase()
  await seedDatabase()
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

function allowedDatabase(email: string, uid = `uid-${email}`) {
  return testEnvironment.authenticatedContext(uid, { email }).database()
}

describe('trusted-player Realtime Database boundary', () => {
  it('denies every read and write to unauthenticated users', async () => {
    const database = testEnvironment.unauthenticatedContext().database()

    await assertFails(get(ref(database, 'meta/schemaVersion')))
    await assertFails(set(ref(database, 'profiles/anonymous'), { value: true }))
  })

  it('denies every read and write to another authenticated email', async () => {
    const database = allowedDatabase(DENIED_EMAIL)

    await assertFails(get(ref(database, 'dictionaries/balda/startWords/count')))
    await assertFails(get(ref(database, 'pushSubscriptions/grinch131')))
    await assertFails(
      set(ref(database, 'pushSubscriptions/grinch131/device-1'), {
        endpoint: 'https://push.example/device-1',
        keys: { p256dh: 'key', auth: 'auth' },
      }),
    )
    await assertFails(
      set(ref(database, 'gameTypes/balda/currentGameId'), 'forbidden-game'),
    )
  })

  it('compares allowed emails exactly as lowercase rule values', async () => {
    const database = allowedDatabase('Grinch131@gmail.com')

    await assertFails(get(ref(database, 'meta/schemaVersion')))
    await assertFails(set(ref(database, 'anything'), true))
  })

  it.each(ALLOWED_EMAILS)(
    'allows %s to read and write any database area',
    async (email) => {
      const database = allowedDatabase(email)

      await assertSucceeds(get(ref(database, 'meta/schemaVersion')))
      await assertSucceeds(
        set(ref(database, 'dictionaries/balda/startWords/items/0'), 'КНИГА'),
      )
      await assertSucceeds(
        set(ref(database, 'profiles/another-player'), {
          arbitrary: 'value',
        }),
      )
      await assertSucceeds(
        set(ref(database, 'gameTypes/balda/currentGameId'), 'game-1'),
      )
      await assertSucceeds(
        set(ref(database, 'unknownNamespace/anything'), true),
      )
      await assertSucceeds(
        set(ref(database, 'pushSubscriptions/grinch131/device-1'), {
          endpoint: 'https://push.example/device-1',
          expirationTime: null,
          keys: { p256dh: 'key', auth: 'auth' },
        }),
      )
      await assertSucceeds(
        get(ref(database, 'pushSubscriptions/grinch131/device-1')),
      )
      await assertSucceeds(remove(ref(database, 'gameTypes/balda/games/existing')))
    },
  )
})
