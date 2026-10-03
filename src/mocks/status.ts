/**
 * Whether the mock API's service worker is installed in this browser.
 *
 * The mocks are how the ranking and the match history have anything to read (spec §6 says they must work
 * in the published build too), but a service worker can fail to start for reasons the app cannot fix: a
 * browser or extension that blocks service workers, or a context that is not secure. `main.tsx` catches
 * that so the game still runs — and this flag is how the screens that depend on the mock API can say
 * *why* they have nothing to show instead of a bare "the request failed", which is what a reviewer would
 * otherwise have to guess at.
 *
 * It is set once, before React mounts, so a plain module value is enough: there is nothing to subscribe
 * to and no render to trigger.
 */
let available = true

export function markMocksUnavailable(): void {
  available = false
}

export function areMocksAvailable(): boolean {
  return available
}
