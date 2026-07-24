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
const ALLOWED_EMAIL = 'grinch131@gmail.com'
const OTHER_ALLOWED_EMAIL = 'hinhillaa@gmail.com'
const DENIED_EMAIL = 'stranger@example.com'

let testEnvironment: RulesTestEnvironment

beforeAll(async () => {
  const rules = await readFile(
    new URL('../../database.rules.json', import.meta.url),
    'utf8',
  )

  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules },
  })

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
        balda: {},
      },
    })
  })
})

afterEach(async () => {
  await testEnvironment.clearDatabase()
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
        balda: {},
      },
    })
  })
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

function allowedDatabase(email = ALLOWED_EMAIL, uid = 'uid-grinch') {
  return testEnvironment.authenticatedContext(uid, { email }).database()
}

describe('Realtime Database access baseline', () => {
  it('denies protected reads to unauthenticated users', async () => {
    const database = testEnvironment.unauthenticatedContext().database()

    await assertFails(get(ref(database, 'meta/schemaVersion')))
  })

  it.each([ALLOWED_EMAIL, OTHER_ALLOWED_EMAIL])(
    'allows protected reads to %s',
    async (email) => {
      await assertSucceeds(get(ref(allowedDatabase(email), 'meta/schemaVersion')))
      await assertSucceeds(
        get(ref(allowedDatabase(email), 'dictionaries/balda/startWords/count')),
      )
    },
  )

  it('denies protected reads to an unlisted authenticated user', async () => {
    await assertFails(
      get(ref(allowedDatabase(DENIED_EMAIL, 'uid-stranger'), 'meta/schemaVersion')),
    )
  })

  it('prevents every client from changing the dictionary', async () => {
    await assertFails(
      set(
        ref(allowedDatabase(), 'dictionaries/balda/startWords/items/0'),
        'КНИГА',
      ),
    )
  })

  it('allows a user to write only a valid matching profile', async () => {
    await assertSucceeds(
      set(ref(allowedDatabase(), 'profiles/grinch131'), {
        playerId: 'grinch131',
        uid: 'uid-grinch',
        email: ALLOWED_EMAIL,
        displayName: 'Grinch',
        photoURL: 'https://example.com/avatar.png',
        lastSeenAt: 1,
      }),
    )

    await assertFails(
      set(ref(allowedDatabase(), 'profiles/hinhillaa'), {
        playerId: 'hinhillaa',
        uid: 'uid-grinch',
        email: ALLOWED_EMAIL,
        lastSeenAt: 1,
      }),
    )
  })

  it('denies game writes until transactional rules are implemented', async () => {
    await assertFails(
      set(ref(allowedDatabase(), 'gameTypes/balda/currentGameId'), 'game-1'),
    )
  })
})
