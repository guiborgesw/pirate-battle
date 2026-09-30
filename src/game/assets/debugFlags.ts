/**
 * Debug affordances that make failure paths reproducible without DevTools.
 *
 * `?assets=missing` models "a texture request is blocked": the *first* load attempt fails, and any
 * retry (the Retry button, or a manual `loadAssets()` call) succeeds — exactly like unblocking the
 * URL in the network panel. The flag is consumed on first use so a reload is needed to fail again,
 * which keeps the behaviour deterministic for the Playwright suite (spec §8 item 2).
 */

const ASSET_FAILURE_VALUE = 'missing'

let consumed = false

export function assetsShouldFailOnce(search: string = window.location.search): boolean {
  if (consumed) return false

  const requested = new URLSearchParams(search).get('assets')
  if (requested !== ASSET_FAILURE_VALUE) return false

  consumed = true
  return true
}

export function resetAssetFailureFlag(): void {
  consumed = false
}
