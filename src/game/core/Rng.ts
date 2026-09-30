/**
 * Deterministic RNG (mulberry32). The simulation never calls `Math.random()` — the seed comes from
 * the session (`?seed=`, default 1) which is what makes spawns and mock latency reproducible in the
 * Playwright suite.
 */

export type Rng = {
  readonly seed: number
  /** [0, 1) */
  next(): number
  /** Integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number
  /** Float in [min, max). */
  nextFloat(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  /** Weighted pick: `weights[i]` belongs to `items[i]`. */
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T
  /** Independent stream derived from this seed (used to keep subsystems uncorrelated). */
  fork(salt: number): Rng
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: Rng = {
    seed,

    next,

    nextInt(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1))
    },

    nextFloat(min: number, max: number): number {
      return min + next() * (max - min)
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() called with an empty list')
      const index = Math.floor(next() * items.length)
      const item = items[index]
      if (item === undefined) throw new Error(`pick() produced an out-of-range index ${index}`)
      return item
    },

    pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
      if (items.length === 0 || items.length !== weights.length) {
        throw new Error('pickWeighted() needs one weight per item')
      }

      let total = 0
      for (const weight of weights) total += weight
      if (total <= 0) return rng.pick(items)

      let roll = next() * total
      let chosen = 0

      for (let index = 0; index < items.length; index += 1) {
        const weight = weights[index] ?? 0
        if (weight <= 0) continue
        chosen = index
        roll -= weight
        if (roll <= 0) break
      }

      const item = items[chosen]
      if (item === undefined) throw new Error('pickWeighted() resolved to a missing item')
      return item
    },

    fork(salt: number): Rng {
      return createRng((seed + salt * 0x9e3779b9) >>> 0)
    },
  }

  return rng
}
