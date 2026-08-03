import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('global styles', () => {
  it('opts history words out of WebKit double-tap handling', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/styles/global.css'),
      'utf8',
    )
    const rule = /\.move-history-word\s*\{(?<body>[^}]*)\}/u.exec(source)

    expect(rule?.groups?.body).toMatch(/\btouch-action:\s*manipulation\s*;/u)
  })
})
