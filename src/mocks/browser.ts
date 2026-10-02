/**
 * The service worker that intercepts `/api` (spec §6: the mocks must work in the published build too,
 * which is why this is started in every build and not only in development).
 *
 * `onUnhandledRequest: 'bypass'` keeps every other request — assets, the game worker-free canvas —
 * completely untouched.
 */
import { setupWorker } from 'msw/browser'

import { handlers } from './handlers.ts'

export const worker = setupWorker(...handlers)
