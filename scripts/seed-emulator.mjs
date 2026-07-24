import { readFile } from 'node:fs/promises'

const seedUrl = new URL('../firebase-data/seed.json', import.meta.url)
const seed = JSON.parse(await readFile(seedUrl, 'utf8'))
const startWords = seed?.dictionaries?.balda?.startWords
const items = startWords?.items
const words = items ? Object.values(items) : []

if (!Number.isInteger(startWords?.count) || startWords.count < 100) {
  throw new Error('The dictionary count must be an integer of at least 100.')
}

if (startWords.count !== words.length) {
  throw new Error(
    `Dictionary count (${startWords.count}) does not match the number of words (${words.length}).`,
  )
}

for (let index = 0; index < words.length; index += 1) {
  if (!Object.hasOwn(items, String(index))) {
    throw new Error(`Dictionary index ${index} is missing.`)
  }
}

if (new Set(words).size !== words.length) {
  throw new Error('The starting-word dictionary contains duplicates.')
}

const invalidWords = words.filter(
  (word) => typeof word !== 'string' || !/^[А-ЯЁ]{5}$/u.test(word),
)

if (invalidWords.length > 0) {
  throw new Error(`Invalid starting words: ${invalidWords.join(', ')}`)
}

const emulatorHost =
  process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000'
const projectId = process.env.GCLOUD_PROJECT || 'demo-simple-games'
const endpoint = `http://${emulatorHost}/.json?ns=${encodeURIComponent(projectId)}`
const response = await fetch(endpoint, {
  method: 'PUT',
  headers: {
    authorization: 'Bearer owner',
    'content-type': 'application/json',
  },
  body: JSON.stringify(seed),
})

if (!response.ok) {
  const details = await response.text()
  throw new Error(
    `The emulator rejected the import (${response.status}): ${details || 'no details'}`,
  )
}

console.log(
  `Imported schemaVersion and ${words.length} starting words into the ${projectId} emulator.`,
)
