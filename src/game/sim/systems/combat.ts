/**
 * What happens when something hits something: projectile damage, the Chaser's ram, and the score.
 *
 * The rules come straight from the challenge spec §2:
 * - a projectile applies its damage **once** and dies on impact, so a killing shot cannot also hit
 *   the next ship in the same step;
 * - a destroyed enemy stops firing, damaging and colliding (it is removed by the step's `compact()`);
 * - the score moves only for kills the player caused. A Chaser that blows itself up against the
 *   player's hull scores nothing — `killedBy` is what separates those two cases.
 */
import { distanceSquared } from '../../core/math.ts'
import type { EnemyShip, KilledBy, Projectile } from '../entities.ts'
import type { World } from '../World.ts'

type Circle = { readonly x: number; readonly y: number; readonly radius: number }

export function projectileImpactSystem(world: World): void {
  const player = world.player

  for (const projectile of world.projectiles) {
    if (!projectile.alive) continue

    if (projectile.owner === 'player') {
      const target = firstHit(world.enemies, projectile)
      if (target === undefined) continue

      projectile.alive = false
      damageEnemy(world, target, projectile.damage, 'player')
      continue
    }

    if (!player.alive || !overlaps(projectile, player)) continue

    projectile.alive = false
    damagePlayer(world, projectile.damage)
  }
}

/** Chasers ram: the player takes `contactDamage` and the Chaser explodes on impact. */
export function chaserContactSystem(world: World): void {
  const player = world.player
  if (!player.alive) return

  for (const enemy of world.enemies) {
    if (!enemy.alive || enemy.kind !== 'chaser') continue
    if (!overlaps(enemy, player)) continue

    damagePlayer(world, world.config.chaser.contactDamage)
    killEnemy(world, enemy, 'self')
  }
}

function firstHit(enemies: readonly EnemyShip[], projectile: Projectile): EnemyShip | undefined {
  for (const enemy of enemies) {
    if (enemy.alive && overlaps(projectile, enemy)) return enemy
  }

  return undefined
}

/** Every ship and projectile is a circle; contact counts, so the radii are summed. */
function overlaps(a: Circle, b: Circle): boolean {
  const reach = a.radius + b.radius
  return distanceSquared(a.x, a.y, b.x, b.y) <= reach * reach
}

function damageEnemy(world: World, enemy: EnemyShip, amount: number, source: KilledBy): void {
  enemy.hp = Math.max(0, enemy.hp - amount)
  if (enemy.hp === 0) killEnemy(world, enemy, source)
}

function killEnemy(world: World, enemy: EnemyShip, killedBy: KilledBy): void {
  enemy.alive = false
  enemy.killedBy = killedBy

  // Only a kill the player caused is worth a point (spec §2).
  if (killedBy === 'player') world.score += 1
}

function damagePlayer(world: World, amount: number): void {
  const player = world.player
  player.hp = Math.max(0, player.hp - amount)

  // Ending the match on death is M8's rule. Until then a wrecked ship simply stops sailing, shooting
  // and counting as a target: every system checks `alive`, and nothing removes the player from the
  // array.
  if (player.hp === 0) player.alive = false
}
