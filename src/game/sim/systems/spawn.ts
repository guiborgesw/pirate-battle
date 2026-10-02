/**
 * Spawn schedule and placement (plan §1.3).
 *
 * Every `spawn.intervalMs` the system looks for a berth: up to `spawn.candidates` random points in the
 * arena's edge band, and the first one that is clear of islands and at least
 * `spawn.minDistanceFromPlayer` away from the player wins. If none passes, that tick is skipped
 * rather than forced — an enemy materialising on top of the player would be unfair damage, which the
 * challenge spec calls out explicitly.
 *
 * Type is weighted, with one exception: the first two spawns are forced to one of each kind, so a
 * match always shows both enemy types even with cold dice (spec §2: both types must appear in a
 * standard match).
 */
import { distanceSquared } from '../../core/math.ts'
import type { EnemyShip } from '../entities.ts'
import type { World } from '../World.ts'

export type Berth = { readonly x: number; readonly y: number }

export function spawnSystem(world: World, dtMs: number): void {
  if (world.enemies.length >= world.config.spawn.maxAlive) return

  world.spawnElapsedMs += dtMs
  if (world.spawnElapsedMs < world.config.spawn.intervalMs) return
  world.spawnElapsedMs -= world.config.spawn.intervalMs

  const kind = chooseKind(world)
  const berth = findBerth(world, kind)
  if (berth === undefined) return

  addEnemy(world, kind, berth.x, berth.y)
  world.spawnsMade += 1
}

/**
 * The first candidate berth for one kind of ship: clear of islands for *its* hull, and far enough
 * from the player. The kind is chosen first so the clearance test matches the hull that will use it.
 */
export function findBerth(world: World, kind: EnemyShip['kind']): Berth | undefined {
  const spawn = world.config.spawn

  for (let attempt = 0; attempt < spawn.candidates; attempt += 1) {
    const point = randomEdgePoint(world, kind)
    if (!isClearOfIslands(world, point.x, point.y, radiusFor(world, kind))) continue

    const gap = Math.sqrt(distanceSquared(point.x, point.y, world.player.x, world.player.y))
    if (gap < spawn.minDistanceFromPlayer) continue

    return point
  }

  return undefined
}

/** Creates one enemy at a fixed spot — the schedule's spawn and the browser test hook share this. */
export function addEnemy(world: World, kind: EnemyShip['kind'], x: number, y: number): EnemyShip {
  const stats = kind === 'chaser' ? world.config.chaser : world.config.shooter

  const enemy: EnemyShip = {
    id: world.nextEntityId,
    kind,
    x,
    y,
    // Face the middle of the arena, so a fresh ship sails into the fight instead of into the wall.
    rotation: Math.atan2(world.config.arena.width / 2 - x, -(world.config.arena.height / 2 - y)),
    prevX: x,
    prevY: y,
    prevRotation: 0,
    vx: 0,
    vy: 0,
    radius: stats.radius,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    alive: true,
    cooldownMs: 0,
    killedBy: undefined,
  }

  world.nextEntityId += 1
  world.enemies.push(enemy)
  return enemy
}

function chooseKind(world: World): EnemyShip['kind'] {
  // One of each in the first two spawns (spec §2), then the configured weights.
  if (world.spawnsMade === 0) return 'chaser'
  if (world.spawnsMade === 1) return 'shooter'

  const chaserShare = world.config.spawn.weights.chaser
  return world.rng.next() < chaserShare ? 'chaser' : 'shooter'
}

/** A random point inside the edge band, with the hull clear of the wall. */
function randomEdgePoint(world: World, kind: EnemyShip['kind']): Berth {
  const { width, height } = world.config.arena
  const band = world.config.spawn.edgeBandPx
  const margin = radiusFor(world, kind)
  const offset = world.rng.nextFloat(margin, band)
  const horizontal = world.rng.nextInt(0, 1) === 0
  const nearSide = world.rng.nextInt(0, 1) === 0

  if (horizontal) {
    return {
      x: nearSide ? offset : width - offset,
      y: world.rng.nextFloat(margin, height - margin),
    }
  }

  return {
    x: world.rng.nextFloat(margin, width - margin),
    y: nearSide ? offset : height - offset,
  }
}

function isClearOfIslands(world: World, x: number, y: number, radius: number): boolean {
  for (const circle of world.islands) {
    const clearance = Math.sqrt(distanceSquared(x, y, circle.x, circle.y)) - circle.radius
    if (clearance < radius) return false
  }

  return true
}

function radiusFor(world: World, kind: EnemyShip['kind']): number {
  return kind === 'chaser' ? world.config.chaser.radius : world.config.shooter.radius
}
