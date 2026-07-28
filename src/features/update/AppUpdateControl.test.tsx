import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppUpdateDialog } from './AppUpdateControl'

describe('AppUpdateDialog', () => {
  it('shows every change and confirms the update', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <AppUpdateDialog
        notice={{
          latestReleaseId: 3,
          notes: [
            { id: 2, text: 'Исправлено игровое поле' },
            { id: 3, text: 'Нутрянка' },
          ],
        }}
        onConfirm={onConfirm}
      />,
    )

    expect(
      screen.getByRole('dialog', { name: 'Приложение обновлено' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Список изменений' }),
    ).toHaveTextContent('Исправлено игровое полеНутрянка')

    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('supports a deployment without a new commit note', () => {
    render(
      <AppUpdateDialog
        notice={{ latestReleaseId: 3, notes: [] }}
        onConfirm={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Приложение обновлено' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Список изменений' }),
    ).not.toBeInTheDocument()
  })
})
