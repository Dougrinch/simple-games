import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const RELEASE_NOTES_PATH = 'release-notes.json'
const MAX_NOTE_LENGTH = 80

function fail(message) {
  throw new Error(`Release notes check failed: ${message}`)
}

function parseReleaseNotes(source, location) {
  let value
  try {
    value = JSON.parse(source)
  } catch {
    fail(`${location} is not valid JSON.`)
  }

  if (!Array.isArray(value) || value.length === 0) {
    fail(`${location} must contain a non-empty array.`)
  }

  for (const [index, entry] of value.entries()) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      Object.keys(entry).sort().join(',') !== 'id,text'
    ) {
      fail(`${location} entry ${index + 1} must contain only id and text.`)
    }

    if (entry.id !== index + 1) {
      fail(`${location} entry ${index + 1} must have id ${index + 1}.`)
    }

    if (
      typeof entry.text !== 'string' ||
      entry.text !== entry.text.trim() ||
      entry.text.length === 0 ||
      entry.text.length > MAX_NOTE_LENGTH ||
      /[\r\n]/u.test(entry.text)
    ) {
      fail(
        `${location} entry ${entry.id} text must be one trimmed line of 1-${MAX_NOTE_LENGTH} characters.`,
      )
    }
  }

  return value
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.ignoreErrors ? 'ignore' : 'pipe'],
  }).trim()
}

function readNotesAtRevision(revision) {
  try {
    return parseReleaseNotes(
      git(['show', `${revision}:${RELEASE_NOTES_PATH}`]),
      `${RELEASE_NOTES_PATH} at ${revision.slice(0, 8)}`,
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Release notes check failed:')
    ) {
      throw error
    }
    fail(
      `${RELEASE_NOTES_PATH} is missing at commit ${revision.slice(0, 8)}.`,
    )
  }
}

function entriesEqual(left, right) {
  return left.id === right.id && left.text === right.text
}

const currentNotes = parseReleaseNotes(
  readFileSync(RELEASE_NOTES_PATH, 'utf8'),
  RELEASE_NOTES_PATH,
)

const creationCommit = git(
  [
    'log',
    '--diff-filter=A',
    '--format=%H',
    '--reverse',
    '--',
    RELEASE_NOTES_PATH,
  ],
  { ignoreErrors: true },
)
  .split('\n')
  .find(Boolean)

if (!creationCommit) {
  console.log(
    `${RELEASE_NOTES_PATH} is valid; commit history validation starts after the file is committed.`,
  )
  process.exit(0)
}

const commits = git([
  'rev-list',
  '--reverse',
  '--topo-order',
  `${creationCommit}^..HEAD`,
])
  .split('\n')
  .filter(Boolean)

for (const commit of commits) {
  const parents = git(['show', '-s', '--format=%P', commit])
    .split(' ')
    .filter(Boolean)

  if (parents.length > 1) {
    continue
  }

  const previousNotes =
    parents.length === 0
      ? []
      : (() => {
          try {
            return JSON.parse(
              git(['show', `${parents[0]}:${RELEASE_NOTES_PATH}`]),
            )
          } catch {
            return []
          }
        })()
  const notes = readNotesAtRevision(commit)

  if (notes.length !== previousNotes.length + 1) {
    fail(
      `commit ${commit.slice(0, 8)} must append exactly one release note.`,
    )
  }

  if (
    !previousNotes.every((entry, index) =>
      entriesEqual(entry, notes[index]),
    )
  ) {
    fail(
      `commit ${commit.slice(0, 8)} modifies or removes an existing release note.`,
    )
  }
}

const committedNotes = readNotesAtRevision('HEAD')
if (
  currentNotes.length < committedNotes.length ||
  !committedNotes.every((entry, index) =>
    entriesEqual(entry, currentNotes[index]),
  )
) {
  fail('working tree modifies or removes a committed release note.')
}

console.log(
  `${RELEASE_NOTES_PATH} is valid (${currentNotes.length} entries checked).`,
)
