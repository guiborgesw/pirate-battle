/**
 * The match clock and its two endings.
 *
 * Running last in the step is deliberate: the step in which the buzzer sounds resolves completely (a
 * cannonball already in the air can still land), and the freeze begins with the next step.
 *
 * The freeze itself is a single guard at the top of `stepWorld`, not a check spread through every
 * system — that is what makes "the end stops movement, attacks, damage, spawns and scoring" (spec §2)
 * true by construction rather than by review.
 */
import type { World } from '../World.ts'

export type SimEndReason = 'time' | 'death'

export function matchSystem(world: World, dtMs: number): void {
  if (world.ended) return

  world.remainingMs = Math.max(0, world.remainingMs - dtMs)

  // Sinking is checked first: if the player goes down on the same step the clock expires, the reason
  // that matters is the one the fight produced.
  if (!world.player.alive) {
    endMatch(world, 'death')
    return
  }

  if (world.remainingMs === 0) endMatch(world, 'time')
}

/** Setting the first reason wins; later calls cannot rewrite how the match ended. */
export function endMatch(world: World, reason: SimEndReason): void {
  if (world.ended) return

  world.ended = true
  world.endReason = reason
}
