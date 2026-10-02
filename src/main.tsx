import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { createQueryClient } from './api/queryClient.ts'
import { resolveScenario } from './mocks/scenarios.ts'
import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container #root is missing from index.html')
}

/**
 * The mock API runs in every build (spec §6: it must work in the published one too). A browser that
 * cannot start a service worker still gets the game — the ranking and history tabs will simply report
 * that they could not load, which is a state they already handle.
 */
async function startMocks(): Promise<void> {
  try {
    const { worker } = await import('./mocks/browser.ts')
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    })
  } catch (error) {
    console.warn('Mock API unavailable; the ranking and history tabs will report errors.', error)
  }
}

resolveScenario(window.location.search)

void startMocks().then(() => {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})
