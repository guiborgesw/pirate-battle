/**
 * Projectiles: creation, integration and the rules that end a shot's life.
 *
 * A shot dies of old age (`lifeMs`), when it leaves the arena, or when it touches an island — the
 * island check lives in `collision.ts`, next to the ship-vs-island rule. A projectile that dies sets
 * `alive = false` and records *why* in `deathReason` immediately, so nothing else in the same step can
 * still act on it (a shot can never damage twice) and the render layer knows which effect belongs to
 * that spot. `compact()` in `World.ts` removes it at the end of the step and reports it.
 *
 * Creating a shot also reports a `shotFired` event with the exact muzzle point and heading, because
 * the muzzle flash, the smoke puff and the cannon sound all belong where the gun actually is — the
 * render layer should never have to re-derive that geometry.
 *
 * Damage is applied by the impact system in `combat.ts`.
 */
import { MS_PER_SECOND } from '../../core/math.ts'
import type { GunMount, Projectile, ProjectileOwner } from '../entities.ts'
import type { World } from '../World.ts'

export type ProjectileSpawn = {
  readonly owner: ProjectileOwner
  readonly mount: GunMount
  readonly headingRad: number
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly radius: number
  readonly damage: number
  readonly lifeMs: number
}

export function spawnProjectile(world: World, spawn: ProjectileSpawn): Projectile {
  const projectile: Projectile = {
    id: world.nextEntityId,
    owner: spawn.owner,
    x: spawn.x,
    y: spawn.y,
    prevX: spawn.x,
    prevY: spawn.y,
    vx: spawn.vx,
    vy: spawn.vy,
    radius: spawn.radius,
    damage: spawn.damage,
    lifeMs: spawn.lifeMs,
    deathReason: 'expired',
    alive: true,
  }

  world.nextEntityId += 1
  if (spawn.owner === 'player') world.shotsFired += 1
  world.projectiles.push(projectile)

  world.events.push({
    type: 'shotFired',
    id: projectile.id,
    owner: spawn.owner,
    mount: spawn.mount,
    x: spawn.x,
    y: spawn.y,
    headingRad: spawn.headingRad,
  })

  return projectile
}

/** Moves every shot and ends the ones that ran out of lifetime or left the arena. */
export function projectilesSystem(world: World, dtMs: number): void {
  const dtSec = dtMs / MS_PER_SECOND
  const { width, height } = world.config.arena

  for (const projectile of world.projectiles) {
    if (!projectile.alive) continue

    projectile.x += projectile.vx * dtSec
    projectile.y += projectile.vy * dtSec
    projectile.lifeMs -= dtMs

    const outside =
      projectile.x < 0 || projectile.y < 0 || projectile.x > width || projectile.y > height

    if (outside || projectile.lifeMs <= 0) {
      projectile.alive = false
      // A shot that ran out of range falls into the sea; one that left the arena is simply gone.
      projectile.deathReason = outside ? 'edge' : 'expired'
    }
  }
}
