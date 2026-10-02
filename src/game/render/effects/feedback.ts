/**
 * The single place where simulation events become visible effects and audible sounds.
 *
 * Pure on purpose: given an event it returns what should be spawned and played. That keeps the
 * decisions ("a lethal hit is an explosion, a splash only happens when a shot dies over water, a
 * broadside uses the broadside recording") assertable in `pnpm self-check`, with no Pixi and no audio
 * device involved — the layer that executes the requests stays dumb.
 */
import type { SoundKey } from '../../assets/manifest.ts'
import type { EffectKind, SpawnOptions } from './EffectsLayer.ts'
import type { SimEvent } from '../../sim/World.ts'

export type EffectRequest = {
  readonly kind: EffectKind
  readonly x: number
  readonly y: number
  readonly options?: SpawnOptions
}

export type SoundRequest = {
  readonly key: SoundKey
  readonly gain: number
  /** Small offset for sounds that belong *after* their effect, like a wreck finishing its sink. */
  readonly delayMs?: number
}

export type Feedback = {
  readonly effects: readonly EffectRequest[]
  readonly sounds: readonly SoundRequest[]
}

const CANNON_VARIANTS: readonly SoundKey[] = ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3']
const WATER_HITS: readonly SoundKey[] = ['cannonball_water_hit_1', 'cannonball_water_hit_2']
const WOOD_HITS: readonly SoundKey[] = ['ship_wood_hit_1', 'ship_wood_hit_2']

/** Deterministic variant pick: the same shot always sounds the same, which keeps tests honest. */
function pick(variants: readonly SoundKey[], seed: number): SoundKey {
  return variants[seed % variants.length] ?? variants[0] ?? 'cannon_fire_1'
}

/**
 * Turns one event into the feedback it deserves.
 *
 * `undefined` means "nothing to show": a shot that leaves the arena has no visible end, and the
 * removal of a projectile that *hit* something is already covered by the damage event that hit it —
 * spawning a splash there too would double every impact.
 */
export function feedbackForEvent(event: SimEvent): Feedback | undefined {
  if (event.type === 'shotFired') {
    const player = event.owner === 'player'
    const broadside = event.mount !== 'front'

    return {
      effects: [
        {
          kind: 'muzzle',
          x: event.x,
          y: event.y,
          options: { rotationRad: event.headingRad, scale: player ? 1 : 0.85 },
        },
      ],
      sounds: [
        broadside
          ? { key: 'cannon_broadside', gain: player ? 0.9 : 0.35 }
          : { key: pick(CANNON_VARIANTS, event.id), gain: player ? 0.9 : 0.4 },
      ],
    }
  }

  if (event.type === 'damage') {
    const playerTarget = event.target === 'player'

    if (event.lethal) {
      return {
        effects: [
          {
            kind: 'explosion',
            x: event.x,
            y: event.y,
            options: { scale: playerTarget ? 1.15 : 1 },
          },
        ],
        sounds: playerTarget
          ? [
              { key: 'ship_explosion_2', gain: 1 },
              { key: 'game_over', gain: 0.7, delayMs: 420 },
            ]
          : [
              { key: 'ship_explosion_1', gain: 0.85 },
              { key: 'ship_sinking', gain: 0.5, delayMs: 300 },
              // The kill that scores is announced as well as heard.
              ...(event.source === 'player'
                ? ([{ key: 'score_point', gain: 0.6, delayMs: 160 }] satisfies SoundRequest[])
                : []),
            ],
      }
    }

    if (event.source === 'ram') {
      return {
        effects: [{ kind: 'impact', x: event.x, y: event.y, options: { scale: 1.2 } }],
        sounds: [
          { key: 'ship_collision', gain: 0.9 },
          { key: 'ship_wood_hit_2', gain: 0.7, delayMs: 60 },
        ],
      }
    }

    return {
      effects: [{ kind: 'impact', x: event.x, y: event.y }],
      sounds: [{ key: pick(WOOD_HITS, event.targetId), gain: 0.65 }],
    }
  }

  // Removals: only the ones that ended somewhere visible on the water deserve an effect.
  if (event.entity === 'projectile') {
    if (event.reason === 'expired') {
      return {
        effects: [{ kind: 'splash', x: event.x, y: event.y, options: { scale: 0.9 } }],
        sounds: [{ key: pick(WATER_HITS, event.id), gain: 0.5 }],
      }
    }

    if (event.reason === 'terrain') {
      // Dust on the rocks, with a muted splash sound: the shot did land on something solid.
      return {
        effects: [{ kind: 'dust', x: event.x, y: event.y }],
        sounds: [{ key: 'cannonball_water_hit_1', gain: 0.35 }],
      }
    }

    return undefined
  }

  // An enemy removal is reported by the lethal damage event that caused it.
  return undefined
}
