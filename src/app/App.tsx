import { useEffect, useState } from 'react'

import {
  isFirebaseEmulatorMode,
  readStartWordCountFromEmulator,
} from '../platform/firebase/connectionCheck'

type ConnectionCheckState =
  | { status: 'checking' }
  | { status: 'connected'; wordCount: number }
  | { status: 'failed' }
  | { status: 'production' }

export function App() {
  const emulatorMode = isFirebaseEmulatorMode()
  const [connection, setConnection] = useState<ConnectionCheckState>(
    emulatorMode ? { status: 'checking' } : { status: 'production' },
  )

  useEffect(() => {
    if (!emulatorMode) {
      return
    }

    let active = true

    void readStartWordCountFromEmulator()
      .then((wordCount) => {
        if (active) {
          setConnection({ status: 'connected', wordCount })
        }
      })
      .catch((error: unknown) => {
        console.error('Firebase connection check failed.', error)

        if (active) {
          setConnection({ status: 'failed' })
        }
      })

    return () => {
      active = false
    }
  }, [emulatorMode])

  return (
    <main className="setup-screen">
      <section className="setup-card" aria-labelledby="setup-title">
        <p className="setup-eyebrow">Балда · этап 1</p>
        <h1 id="setup-title">Окружение готово</h1>
        <p>
          Каркас React, TypeScript, Firebase и автоматических проверок настроен.
          Реализация игрового интерфейса начнётся на следующем этапе.
        </p>
        <p className="setup-connection" role="status" aria-live="polite">
          {connection.status === 'checking' && 'Проверяем соединение с базой…'}
          {connection.status === 'connected' && (
            <>
              Соединение с базой есть. Слов в базе:{' '}
              <strong>{connection.wordCount}</strong>
            </>
          )}
          {connection.status === 'failed' &&
            'Нет соединения с базой. Проверьте эмуляторы и импорт данных.'}
          {connection.status === 'production' &&
            'Локальная проверка базы отключена в production-режиме.'}
        </p>
      </section>
    </main>
  )
}
