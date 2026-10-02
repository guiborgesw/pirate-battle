/**
 * Enemy steering, exactly as the plan locks it: seek the player, no pathfinding.
 *
 * Each enemy turns toward the player and thrusts along its own heading, so it can only travel where
 * it points — the same physics the player has. What keeps them off the islands is a short probe ahead
 * of the bow (2x the hull radius, plan §1.3): when that probe lands inside a reef, the enemy swerves
 * to whichever side has more clearance. The result reads as steering around an island, without a
 * graph search, and it stays deterministic because every input comes from the world snapshot.
 *
 * Chasers only ever close in. Shooters close in until `preferredRange`, then hold that ring and fire
 * whenever the player is inside `attackRange` and the bow is on target.
 */
import {
  angleDelta,
  clamp,
  distanceSquared,
  headingToVector,
  MS_PER_SECOND,
  normalizeAngle,
} from '../../core/math.ts'
import type { EnemyShip, Ship } from '../entities.ts'
import type { World } from '../World.ts'
import { spawnProjectile } from './projectiles.ts'

type EnemyStats = {
  readonly speed: number
  readonly turnSpeedRad: number
}

export function aiSystem(world: World, dtMs: number): void {
  const dtSec = dtMs / MS_PER_SECOND

  for (const enemy of world.enemies) {
    if (!enemy.alive) continue

    enemy.cooldownMs = Math.max(0, enemy.cooldownMs - dtMs)

    const stats = statsFor(world, enemy)
    const target = world.player

    if (!target.alive) {
      // Nobody left to hunt: keep sailing, so the arena does not freeze mid-step.
      thrust(enemy, stats.speed, dtSec)
      continue
    }

    const toTarget = headingToPoint(enemy, target)
    const aim = avoidIslands(world, enemy, toTarget)
    enemy.rotation = turnTowards(enemy.rotation, aim, stats.turnSpeedRad * dtSec)

    if (enemy.kind === 'chaser') {
      thrust(enemy, stats.speed, dtSec)
      continue
    }

    if (distanceBetween(enemy, target) > world.config.shooter.preferredRange) {
      thrust(enemy, stats.speed, dtSec)
    }

    fireIfOnTarget(world, enemy, toTarget)
  }
}

/** The heading that points a ship at a target. Inverse of `headingToVector` (0 = up, clockwise). */
export function headingToPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y))
}

/**
 * Signed clearance of the probe point: negative means the probe itself is inside an island. When the
 * straight line is blocked, the enemy checks one step to each side and takes the freer one.
 */
export function probeClearance(world: World, ship: Ship, rotation: number): number {
  const forward = headingToVector(rotation)
  const reach = ship.radius * world.config.enemyAi.probeRadii
  const px = ship.x + forward.x * reach
  const py = ship.y + forward.y * reach

  let best = Number.POSITIVE_INFINITY
  for (const circle of world.islands) {
    const clearance = Math.sqrt(distanceSquared(px, py, circle.x, circle.y)) - circle.radius
    if (clearance < best) best = clearance
  }

  return best
}

function avoidIslands(world: World, enemy: EnemyShip, desired: number): number {
  if (world.islands.length === 0) return desired

  const swerve = world.config.enemyAi.swerveRad
  if (probeClearance(world, enemy, desired) > 0) return desired

  const port = normalizeAngle(desired - swerve)
  const starboard = normalizeAngle(desired + swerve)
  return probeClearance(world, enemy, port) >= probeClearance(world, enemy, starboard)
    ? port
    : starboard
}

function turnTowards(rotation: number, target: number, maxStepRad: number): number {
  const step = clamp(angleDelta(rotation, target), -maxStepRad, maxStepRad)
  return normalizeAngle(rotation + step)
}

function thrust(ship: Ship, speed: number, dtSec: number): void {
  const forward = headingToVector(ship.rotation)
  ship.vx = forward.x * speed
  ship.vy = forward.y * speed
  ship.x += ship.vx * dtSec
  ship.y += ship.vy * dtSec
}

function fireIfOnTarget(world: World, enemy: EnemyShip, toTarget: number): void {
  const shooter = world.config.shooter
  if (distanceBetween(enemy, world.player) > shooter.attackRange) return
  if (enemy.cooldownMs > 0) return
  if (Math.abs(angleDelta(enemy.rotation, toTarget)) > world.config.enemyAi.aimToleranceRad) return
  // Never fire into the reef: the shot would only splash against the island.
  if (probeClearance(world, enemy, enemy.rotation) < 0) return

  const forward = headingToVector(enemy.rotation)
  spawnProjectile(world, {
    owner: 'enemy',
    x: enemy.x + forward.x * shooter.weapon.muzzleOffsetPx,
    y: enemy.y + forward.y * shooter.weapon.muzzleOffsetPx,
    vx: forward.x * shooter.weapon.projectileSpeed,
    vy: forward.y * shooter.weapon.projectileSpeed,
    radius: shooter.weapon.projectileRadius,
    damage: shooter.weapon.damage,
    lifeMs: shooter.weapon.lifeMs,
  })

  enemy.cooldownMs = shooter.weapon.cooldownMs
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt(distanceSquared(a.x, a.y, b.x, b.y))
}

function statsFor(world: World, enemy: EnemyShip): EnemyStats {
  const stats = enemy.kind === 'chaser' ? world.config.chaser : world.config.shooter
  return { speed: stats.speed, turnSpeedRad: stats.turnSpeedRad }
}
