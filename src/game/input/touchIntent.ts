/**
 * The touch controls' pure half: where a thumb is on the stick, and what that means for the ship.
 *
 * Kept apart from the React overlay so the mapping can be asserted headlessly — a stick that only
 * worked while someone watched it would be untestable, and this is the part with the arithmetic in it.
 *
 * The stick is a direction, not a throttle: pushing it up sails ahead, pushing it sideways turns, and
 * diagonal does both — which is exactly W+A on a keyboard. There is no reverse, because the ship has
 * none (spec §2).
 */
import type { InputState } from './InputState.ts'
import type { ShipIntent } from '../core/intents.ts'

export type StickIntent = Pick<ShipIntent, 'forward' | 'rotateLeft' | 'rotateRight'>

export const NEUTRAL_STICK: StickIntent = {
  forward: false,
  rotateLeft: false,
  rotateRight: false,
}

/** Fraction of the radius that must be left before the stick counts as pushed at all. */
export const STICK_DEAD_ZONE = 0.16

/** How far sideways the thumb must go before the ship starts turning. */
export const STICK_TURN_THRESHOLD = 0.32

export type Offset = {
  readonly x: number
  readonly y: number
}

/** Screen coordinates → a vector from the stick's centre. */
export function offsetFrom(centre: Offset, point: Offset): Offset {
  return { x: point.x - centre.x, y: point.y - centre.y }
}

/** Keeps the visible nub inside its base while the intent keeps following the finger. */
export function clampToRadius(offset: Offset, radius: number): Offset {
  if (radius <= 0) return { x: 0, y: 0 }

  const distance = Math.hypot(offset.x, offset.y)
  if (distance <= radius) return offset

  const scale = radius / distance
  return { x: offset.x * scale, y: offset.y * scale }
}

export function stickIntentFor(offset: Offset, radius: number): StickIntent {
  if (radius <= 0) return NEUTRAL_STICK

  const nx = offset.x / radius
  const ny = offset.y / radius
  if (Math.hypot(nx, ny) < STICK_DEAD_ZONE) return NEUTRAL_STICK

  return {
    // Up on screen is negative y, and that is ahead — the same as W.
    forward: ny < -STICK_TURN_THRESHOLD,
    rotateLeft: nx < -STICK_TURN_THRESHOLD,
    rotateRight: nx > STICK_TURN_THRESHOLD,
  }
}

/** The three fire controls, in the order they sit on the right thumb. */
export const TOUCH_FIRE_BUTTONS = [
  { intent: 'fireLeft', icon: 'icon_turn_left', label: 'Fire port broadside' },
  { intent: 'fireFront', icon: 'icon_fire', label: 'Fire front cannon' },
  { intent: 'fireRight', icon: 'icon_turn_right', label: 'Fire starboard broadside' },
] as const satisfies readonly {
  readonly intent: keyof ShipIntent
  readonly icon: string
  readonly label: string
}[]

export type FireIntent = Extract<keyof ShipIntent, 'fireFront' | 'fireLeft' | 'fireRight'>

/**
 * The touch controls' writing half.
 *
 * The input state is a mutable object shared with the simulation by design (plan §1.7), and mutating it
 * from a React event handler is the whole point. Wrapping that in a named adapter keeps the intent
 * explicit — and keeps the mutation out of the component, where React's compiler rules are right to
 * object to it.
 */
export type TouchWriter = {
  readonly setStick: (intent: StickIntent) => void
  readonly setFire: (intent: FireIntent, pressed: boolean) => void
  readonly release: () => void
}

export function createTouchWriter(state: InputState): TouchWriter {
  return {
    setStick(intent) {
      state.forward = intent.forward
      state.rotateLeft = intent.rotateLeft
      state.rotateRight = intent.rotateRight
    },
    setFire(intent, pressed) {
      state[intent] = pressed
    },
    release() {
      state.forward = NEUTRAL_STICK.forward
      state.rotateLeft = NEUTRAL_STICK.rotateLeft
      state.rotateRight = NEUTRAL_STICK.rotateRight
      state.fireFront = false
      state.fireLeft = false
      state.fireRight = false
    },
  }
}

/** Everything the UI needs to know about the device it is running on, read in one place. */
export type ViewportConditions = {
  readonly coarsePointer: boolean
  readonly portrait: boolean
  readonly width: number
  /** `?touch=1` forces the touch controls on, which is how the desktop run verifies them. */
  readonly touchForced: boolean
}

/**
 * Whether the touch controls should be shown: a coarse pointer (a finger, not a mouse), a short
 * viewport, or `?touch=1`.
 */
export function touchControlsVisible({
  coarsePointer,
  width,
  touchForced,
}: ViewportConditions): boolean {
  return touchForced || coarsePointer || width <= TOUCH_MAX_WIDTH_PX
}

export const TOUCH_MAX_WIDTH_PX = 900

/** A portrait phone cannot show a landscape arena; the overlay asks for a turn and the match waits. */
export function portraitOverlayVisible({ portrait, width }: ViewportConditions): boolean {
  return portrait && width <= TOUCH_MAX_WIDTH_PX
}
