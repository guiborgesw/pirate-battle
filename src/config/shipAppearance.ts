/**
 * How a ship looks at a given health ratio.
 *
 * The asset pack has no damaged *assembled* ship: the damage ladder lives in the hull parts
 * (`hull_large_1..4` = intact, chipped, badly damaged, grey sunken). This module is the pure mapping
 * between health and that ladder, so it can be asserted in `pnpm self-check` and reused by the
 * effects layer in M10.
 */
import type { ShipKind } from '../game/sim/entities.ts'

/**
 * The asset pack draws ships bow-**down**. Measured, not eyeballed: `hull_large_1` (50x108) is 49 px
 * wide across its top rows and tapers to a 9.9 px point at the bottom of its frame, and the challenge
 * mockups fire from that pointed end. The simulation's heading 0 points up (screen -Y), so every ship
 * view must add this half turn — otherwise the ship sails stern-first.
 *
 * Asserted against the pixels in `pnpm self-check`, so a regenerated atlas cannot silently invalidate
 * it.
 */
export const ART_FACING_OFFSET_RAD = Math.PI

/**
 * A quarter turn clockwise for the bow gun. Its sprite is drawn side-on with the muzzle — the
 * tapering end — on the right (columns 24-28 narrow from 12 px to 9 px). The quarter turn points the
 * barrel along the hull axis instead of across it.
 */
export const BOW_CANNON_ROTATION_RAD = Math.PI / 2

export type HullTier = 1 | 2 | 3 | 4

export type ShipAppearance = {
  /** `hull_large_N` / `hull_small_N` suffix. */
  readonly hullTier: HullTier
  readonly hullFrame: string
  readonly sailFrame: string
  readonly flagFrame: string
}

const DAMAGE_TIER_THRESHOLDS = { chipped: 0.66, damaged: 0.33 } as const

/**
 * Health bar above every ship, measured against the UI atlas: the frame is 256x48 with the fill
 * drawn inside its well (art spans x 30..225, i.e. 196 px, symmetric about the centre). The bar is
 * drawn at `widthPx` logical pixels wide and the fill shrinks from its left edge.
 */
export const HEALTH_BAR = {
  widthPx: 64,
  offsetAboveShipPx: 16,
} as const

export type HealthBarTier = 'green' | 'amber' | 'red'

/** Bar colour follows the same thresholds as the hull damage ladder, so bar and hull agree. */
export function healthBarTier(healthRatio: number): HealthBarTier {
  if (healthRatio <= DAMAGE_TIER_THRESHOLDS.damaged) return 'red'
  if (healthRatio <= DAMAGE_TIER_THRESHOLDS.chipped) return 'amber'
  return 'green'
}

/** 1 = intact, 2 = chipped (<= 66 %), 3 = badly damaged (<= 33 %), 4 = sunk wreck. */
export function hullTierFor(healthRatio: number, dead = false): HullTier {
  if (dead) return 4
  if (healthRatio <= DAMAGE_TIER_THRESHOLDS.damaged) return 3
  if (healthRatio <= DAMAGE_TIER_THRESHOLDS.chipped) return 2
  return 1
}

/** Sail, flag and hull-size choice per ship kind, measured against the challenge mockups. */
const KIND_APPEARANCE: Record<ShipKind, { hull: 'large' | 'small'; sail: string; flag: string }> = {
  // Player: the dark pirate sail with the skull (mockup "you" ship).
  player: { hull: 'large', sail: 'sail_large_2', flag: 'flag_5' },
  // Chaser: red cross (aggressive, closes in).
  chaser: { hull: 'small', sail: 'sail_large_15', flag: 'flag_1' },
  // Shooter: blue horse (keeps its distance and fires).
  shooter: { hull: 'large', sail: 'sail_large_11', flag: 'flag_3' },
}

export function shipAppearance(kind: ShipKind, healthRatio: number, dead = false): ShipAppearance {
  const tier = hullTierFor(healthRatio, dead)
  const base = KIND_APPEARANCE[kind]

  return {
    hullTier: tier,
    hullFrame: `hull_${base.hull}_${tier}`,
    sailFrame: base.sail,
    flagFrame: base.flag,
  }
}
