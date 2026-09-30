/**
 * Primitive maths shared by the simulation. Kept dependency-free and browser-free so the systems
 * stay assertable in `pnpm self-check`.
 *
 * Heading convention (matches Pixi's screen space): `rotation` is radians, `0` points **up**
 * (screen -Y) and positive values turn clockwise. A ship sprite drawn facing up therefore uses
 * `sprite.rotation = ship.rotation` directly.
 */

const FULL_TURN_RAD = Math.PI * 2
const HALF_TURN_RAD = Math.PI

export const MS_PER_SECOND = 1000

export type Vector = {
  readonly x: number
  readonly y: number
}

export function headingToVector(rotation: number): Vector {
  return { x: Math.sin(rotation), y: -Math.cos(rotation) }
}

export function normalizeAngle(rotation: number): number {
  let angle = rotation % FULL_TURN_RAD
  if (angle > HALF_TURN_RAD) angle -= FULL_TURN_RAD
  if (angle < -HALF_TURN_RAD) angle += FULL_TURN_RAD
  return angle
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** Signed difference between two angles, normalised to (-pi, pi]. */
export function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from)
}

export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

/** Interpolates an angle along the shortest path (used for rendering between fixed steps). */
export function lerpAngle(from: number, to: number, alpha: number): number {
  return normalizeAngle(from + angleDelta(from, to) * alpha)
}
