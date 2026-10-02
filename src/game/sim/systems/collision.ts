/**
 * Collisions. Ships and projectiles are circles; islands are lists of circles.
 *
 * Ship vs island: the ship is pushed out along the surface normal and the inward part of its
 * velocity is removed (the tangential part survives, so a ship slides along a shore instead of
 * sticking to it).
 *
 * Projectile vs island: the shot dies on contact and does not bounce — islands are terrain, not
 * targets. The arena edge is handled in `projectiles.ts`, together with lifetime.
 */
import type { Circle } from '../../../config/gameConfig.ts'
import { distanceSquared } from '../../core/math.ts'
import type { Ship } from '../entities.ts'
import type { World } from '../World.ts'
import { allShips } from '../World.ts'

/** Separates a single ship from every island circle it overlaps. */
export function resolveShipIslands(ship: Ship, circles: readonly Circle[]): boolean {
  let touched = false

  for (const circle of circles) {
    let dx = ship.x - circle.x
    let dy = ship.y - circle.y
    const minimumDistance = circle.radius + ship.radius

    if (distanceSquared(ship.x, ship.y, circle.x, circle.y) >= minimumDistance * minimumDistance) {
      continue
    }

    let distance = Math.sqrt(dx * dx + dy * dy)

    if (distance === 0) {
      // Exactly on the centre: pick an arbitrary but stable direction to escape.
      dx = 1
      dy = 0
      distance = 1
    }

    const nx = dx / distance
    const ny = dy / distance

    ship.x = circle.x + nx * minimumDistance
    ship.y = circle.y + ny * minimumDistance

    const inward = ship.vx * nx + ship.vy * ny
    if (inward < 0) {
      ship.vx -= inward * nx
      ship.vy -= inward * ny
    }

    touched = true
  }

  return touched
}

export function islandCollisionSystem(world: World): void {
  if (world.islands.length === 0) return

  for (const ship of allShips(world)) {
    if (!ship.alive) continue
    resolveShipIslands(ship, world.islands)
  }
}

/** Ends every shot that touches an island circle. */
export function projectileIslandSystem(world: World): void {
  if (world.islands.length === 0) return

  for (const projectile of world.projectiles) {
    if (!projectile.alive) continue

    for (const circle of world.islands) {
      const minimumDistance = circle.radius + projectile.radius

      if (
        distanceSquared(projectile.x, projectile.y, circle.x, circle.y) <
        minimumDistance * minimumDistance
      ) {
        projectile.alive = false
        projectile.deathReason = 'terrain'
        break
      }
    }
  }
}
