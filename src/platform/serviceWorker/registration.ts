export function serviceWorkersSupported(): boolean {
  return 'serviceWorker' in navigator
}

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkersSupported()) {
    return null
  }

  return navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    },
  )
}
