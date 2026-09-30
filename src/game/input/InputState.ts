/**
 * Mutable input state shared by every device. Keyboard (M5) and touch (M13) write into the same
 * object, which is why they can be used at the same time.
 */
import type { ShipIntent } from '../core/intents.ts'

/** Mutable mirror of `ShipIntent`, so the state can never drift from the intent contract. */
export type InputState = {
  -readonly [Action in keyof ShipIntent]: ShipIntent[Action]
} & {
  clear(): void
}

export function createInputState(): InputState {
  const state: InputState = {
    forward: false,
    rotateLeft: false,
    rotateRight: false,
    fireFront: false,
    fireLeft: false,
    fireRight: false,

    clear(): void {
      state.forward = false
      state.rotateLeft = false
      state.rotateRight = false
      state.fireFront = false
      state.fireLeft = false
      state.fireRight = false
    },
  }

  return state
}
