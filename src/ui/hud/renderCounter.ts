/**
 * Counts HUD renders.
 *
 * The plan asks for proof that the HUD re-renders at most about once a second (plus on score/health
 * changes) instead of once per frame. That is a property of the React boundary, so the honest way to
 * check it is to count real renders — this counter is read through the browser test hooks.
 *
 * Measured against a production build: React Strict Mode double-invokes render in development, which
 * would double every count here and hide the very thing being measured.
 */
let renders = 0

export function noteHudRender(): void {
  renders += 1
}

export function hudRenderCount(): number {
  return renders
}
