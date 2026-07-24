import { describe, expect, it } from 'vitest'

import { normalizeEmail, playerIdForEmail } from './access'

describe('authorized player allowlist', () => {
  it('maps only the two normalized Google emails to stable player ids', () => {
    expect(playerIdForEmail(' Grinch131@GMAIL.COM ')).toBe('grinch131')
    expect(playerIdForEmail('HINHILLAA@gmail.com')).toBe('hinhillaa')
    expect(playerIdForEmail('stranger@example.com')).toBeNull()
    expect(playerIdForEmail(null)).toBeNull()
  })

  it('normalizes email without changing the stored player id', () => {
    expect(normalizeEmail('  HINHILLAA@GMAIL.COM ')).toBe(
      'hinhillaa@gmail.com',
    )
  })
})
