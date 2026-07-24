import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'

vi.mock('../platform/firebase/connectionCheck', () => ({
  isFirebaseEmulatorMode: () => true,
  readStartWordCountFromEmulator: vi.fn().mockResolvedValue(147),
}))

describe('App', () => {
  it('renders the word count returned by Realtime Database', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('147')).toBeInTheDocument()
  })
})
