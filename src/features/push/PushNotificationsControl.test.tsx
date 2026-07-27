import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PushNotificationsControl } from './PushNotificationsControl'

const pushMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  enable: vi.fn(),
}))

vi.mock('../../platform/push/pushClient', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../platform/push/pushClient')>()
  return {
    ...actual,
    getPushNotificationStatus: pushMocks.getStatus,
    enablePushNotifications: pushMocks.enable,
  }
})

describe('PushNotificationsControl', () => {
  beforeEach(() => {
    pushMocks.getStatus.mockReset().mockResolvedValue('prompt')
    pushMocks.enable.mockReset().mockResolvedValue(undefined)
  })

  it('enables notifications from an explicit user action', async () => {
    const user = userEvent.setup()
    render(
      <PushNotificationsControl playerId="grinch131" online />,
    )

    await user.click(
      await screen.findByRole('button', {
        name: 'Включить уведомления',
      }),
    )

    expect(pushMocks.enable).toHaveBeenCalledWith('grinch131')
    expect(
      screen.getByRole('button', { name: 'Уведомления включены' }),
    ).toBeDisabled()
  })

  it('explains denied and unsupported browser states', async () => {
    pushMocks.getStatus.mockResolvedValueOnce('denied')
    const { unmount } = render(
      <PushNotificationsControl playerId="grinch131" online />,
    )
    expect(
      await screen.findByText(/Уведомления запрещены/u),
    ).toBeInTheDocument()

    unmount()
    pushMocks.getStatus.mockResolvedValueOnce('unsupported')
    render(<PushNotificationsControl playerId="grinch131" online />)
    expect(
      await screen.findByText(/На iPhone добавь игру/u),
    ).toBeInTheDocument()
  })

  it('does not try to subscribe while offline', async () => {
    render(
      <PushNotificationsControl playerId="hinhillaa" online={false} />,
    )

    const button = await screen.findByRole('button', {
      name: 'Включить уведомления',
    })
    expect(button).toBeDisabled()
    expect(
      screen.getByText(/Подключись к сети/u),
    ).toBeInTheDocument()
    expect(pushMocks.enable).not.toHaveBeenCalled()
  })
})
