import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

interface ReleaseNote {
  id: number
  text: string
}

function normalizeBasePath(value: string | undefined): string {
  const basePath = value?.trim() || '/'

  if (!basePath.startsWith('/') || !basePath.endsWith('/')) {
    throw new Error('VITE_BASE_PATH must start and end with "/".')
  }

  return basePath
}

function readReleaseNotes(): ReleaseNote[] {
  const path = resolve(process.cwd(), 'release-notes.json')
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('release-notes.json must contain a non-empty array.')
  }

  return value.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('id' in entry) ||
      !('text' in entry) ||
      entry.id !== index + 1 ||
      typeof entry.text !== 'string'
    ) {
      throw new Error(`Invalid release note at index ${index}.`)
    }

    return { id: entry.id, text: entry.text }
  })
}

function appMetadataPlugin({
  buildId,
  builtAt,
  releaseNotes,
}: {
  buildId: string
  builtAt: number
  releaseNotes: ReleaseNote[]
}): Plugin {
  const latestReleaseId = releaseNotes.at(-1)?.id ?? 0

  return {
    name: 'app-metadata',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({
          version: buildId,
          builtAt,
          latestReleaseId,
        })}\n`,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'release-notes.json',
        source: `${JSON.stringify(releaseNotes, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const releaseNotes = readReleaseNotes()
  const latestReleaseId = releaseNotes.at(-1)?.id ?? 0
  const builtAt = Date.now()
  const buildId =
    process.env.VITE_BUILD_ID?.trim() ||
    env.VITE_BUILD_ID?.trim() ||
    `local-${builtAt.toString(36)}`

  return {
    base: normalizeBasePath(env.VITE_BASE_PATH),
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
      __APP_BUILD_TIME__: JSON.stringify(builtAt),
      __APP_RELEASE_ID__: JSON.stringify(latestReleaseId),
    },
    plugins: [
      react(),
      appMetadataPlugin({ buildId, builtAt, releaseNotes }),
    ],
  }
})
