import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { AppUpdateControl } from './features/update/AppUpdateControl'
import './styles/global.css'

const rootElement = document.querySelector<HTMLDivElement>('#root')

if (!rootElement) {
  throw new Error('Application root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
    <AppUpdateControl />
  </StrictMode>,
)
