import { useEffect, useState } from 'react'

import {
  acknowledgeAppUpdate,
  startAppUpdateManager,
  type AppUpdateNotice,
} from '../../platform/update/appUpdate'

export function AppUpdateDialog({
  notice,
  onConfirm,
}: {
  notice: AppUpdateNotice
  onConfirm: () => void
}) {
  return (
    <div className="app-update-backdrop">
      <section
        className="app-update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
      >
        <h2 id="app-update-title">Приложение обновлено</h2>
        {notice.notes.length > 0 && (
          <ul aria-label="Список изменений">
            {notice.notes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        )}
        <button
          className="primary-button app-update-confirm"
          type="button"
          autoFocus
          onClick={onConfirm}
        >
          OK
        </button>
      </section>
    </div>
  )
}

export function AppUpdateControl() {
  const [notice, setNotice] = useState<AppUpdateNotice | null>(null)

  useEffect(() => {
    const manager = startAppUpdateManager({ onNotice: setNotice })
    return manager.stop
  }, [])

  if (!notice) {
    return null
  }

  return (
    <AppUpdateDialog
      notice={notice}
      onConfirm={() => {
        acknowledgeAppUpdate(notice.latestReleaseId)
        setNotice(null)
      }}
    />
  )
}
