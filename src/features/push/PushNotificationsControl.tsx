import { useEffect, useState } from 'react'

import type { PlayerId } from '../../games/balda/types'
import {
  enablePushNotifications,
  getPushNotificationStatus,
  PushClientError,
  type PushNotificationStatus,
} from '../../platform/push/pushClient'

type ControlStatus = PushNotificationStatus | 'checking' | 'enabling'

export function PushNotificationsControl({
  playerId,
  online,
}: {
  playerId: PlayerId
  online: boolean
}) {
  const [status, setStatus] = useState<ControlStatus>('checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void getPushNotificationStatus()
      .then((nextStatus) => {
        if (active) {
          setStatus(nextStatus)
        }
      })
      .catch(() => {
        if (active) {
          setStatus('prompt')
          setErrorMessage('Не удалось проверить уведомления.')
        }
      })

    return () => {
      active = false
    }
  }, [])

  const enable = async () => {
    setStatus('enabling')
    setErrorMessage(null)

    try {
      await enablePushNotifications(playerId)
      setStatus('enabled')
    } catch (error) {
      if (
        error instanceof PushClientError &&
        error.code === 'permission-denied'
      ) {
        setStatus('denied')
        return
      }

      if (
        error instanceof PushClientError &&
        error.code === 'unsupported'
      ) {
        setStatus('unsupported')
        return
      }

      setStatus('prompt')
      setErrorMessage(
        online
          ? 'Не удалось включить уведомления. Попробуй ещё раз.'
          : 'Для включения уведомлений нужна сеть.',
      )
    }
  }

  if (status === 'unsupported') {
    return (
      <aside className="push-notification-control">
        <p>
          Push-уведомления здесь не поддерживаются. На iPhone добавь игру на
          экран «Домой» и открой оттуда.
        </p>
      </aside>
    )
  }

  if (status === 'denied') {
    return (
      <aside className="push-notification-control">
        <p>
          Уведомления запрещены. Разреши их в настройках браузера или телефона.
        </p>
      </aside>
    )
  }

  return (
    <aside className="push-notification-control">
      <button
        className={`push-notification-button ${
          status === 'enabled' ? 'is-enabled' : ''
        }`}
        type="button"
        disabled={
          status === 'checking' ||
          status === 'enabling' ||
          status === 'enabled' ||
          !online
        }
        onClick={() => void enable()}
      >
        {(status === 'checking' || status === 'enabling') && (
          <span className="spinner" aria-hidden="true" />
        )}
        {status === 'checking'
          ? 'Проверяем уведомления'
          : status === 'enabling'
            ? 'Включаем уведомления'
            : status === 'enabled'
              ? 'Уведомления включены'
              : 'Включить уведомления'}
      </button>
      {!online && status === 'prompt' && (
        <p>Подключись к сети, чтобы включить уведомления.</p>
      )}
      {errorMessage && (
        <p role="alert" aria-live="polite">
          {errorMessage}
        </p>
      )}
    </aside>
  )
}
