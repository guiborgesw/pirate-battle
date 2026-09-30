/**
 * The intent contract between input devices and the simulation.
 *
 * It lives in `core` on purpose: `src/game/sim` may not import `src/game/input` (the equipment that
 * touches the DOM), so the simulation depends on this pure shape while `input/KeyboardInput.ts` and
 * `input/TouchInput.ts` are free to fill it from keyboard events or pointer events.
 */

export type ShipIntent = {
  readonly forward: boolean
  readonly rotateLeft: boolean
  readonly rotateRight: boolean
  readonly fireFront: boolean
  readonly fireLeft: boolean
  readonly fireRight: boolean
}

export const EMPTY_INTENT: ShipIntent = {
  forward: false,
  rotateLeft: false,
  rotateRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
}
