/**
 * Player movement and arena bounds.
 *
 * The player is intent-driven: rotation comes from the turn intents, forward motion from the
 * throttle intent, and both are scaled by `dt` so speed never depends on the frame rate. Enemy
 * steering (M7) writes to the same `vx`/`vy` fields, which keeps collision resolution in one place.
 */
import type { ShipIntent } from '../../core/intents.ts'
import { MS_PER_SECOND, clamp, headingToVector, normalizeAngle } from '../../core/math.ts'
import type { World } from '../World.ts'
import { allShips } from '../World.ts'

export function movementSystem(world: World, dtMs: number, intent: ShipIntent): void {
  const dtSec = dtMs / MS_PER_SECOND
  const stats = world.config.player
  const player = world.player

  if (!player.alive) {
    player.vx = 0
    player.vy = 0
    return
  }

  if (intent.rotateLeft) player.rotation -= stats.turnSpeedRad * dtSec
  if (intent.rotateRight) player.rotation += stats.turnSpeedRad * dtSec
  player.rotation = normalizeAngle(player.rotation)

  const heading = headingToVector(player.rotation)
  const speed = intent.forward ? stats.speed : 0

  player.vx = heading.x * speed
  player.vy = heading.y * speed
  player.x += player.vx * dtSec
  player.y += player.vy * dtSec
}

/** Keeps every ship inside the visible arena, as the challenge spec requires. */
export function applyArenaBounds(world: World): void {
  const { width, height } = world.config.arena

  for (const ship of allShips(world)) {
    const clampedX = clamp(ship.x, ship.radius, width - ship.radius)
    const clampedY = clamp(ship.y, ship.radius, height - ship.radius)

    if (clampedX !== ship.x) {
      ship.x = clampedX
      ship.vx = 0
    }
    if (clampedY !== ship.y) {
      ship.y = clampedY
      ship.vy = 0
    }
  }
}
