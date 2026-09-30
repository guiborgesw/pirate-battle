/**
 * Weapons: the player's three mounts (bow cannon and both broadsides).
 *
 * Each mount keeps its own cooldown, so the mounts never couple: holding every fire key still fires
 * only when that mount's own cooldown has run out. A broadside is a volley of parallel shots leaving
 * perpendicular to the heading (`spec` calls them port and starboard batteries); the spacing between
 * them and the volley size come from the config.
 */
import type { SideWeaponStats, WeaponStats } from '../../../config/gameConfig.ts'
import type { ShipIntent } from '../../core/intents.ts'
import { headingToVector, MS_PER_SECOND } from '../../core/math.ts'
import type { PlayerShip } from '../entities.ts'
import type { World } from '../World.ts'
import { spawnProjectile } from './projectiles.ts'

/**
 * Which flank a broadside volley leaves from: `PORT` mirrors `STARBOARD`.
 */
export type Flank = 1 | -1

export const STARBOARD: Flank = 1
export const PORT: Flank = -1

/**
 * Starboard (right) unit vector for a heading. With `rotation = 0` the ship faces up (screen -Y),
 * so her right flank points towards +x.
 */
export function starboardVector(rotation: number): { x: number; y: number } {
  return { x: Math.cos(rotation), y: Math.sin(rotation) }
}

/** Ticks every weapon cooldown down, clamped at zero. */
export function tickCooldowns(player: PlayerShip, dtMs: number): void {
  player.cooldowns.front = Math.max(0, player.cooldowns.front - dtMs)
  player.cooldowns.left = Math.max(0, player.cooldowns.left - dtMs)
  player.cooldowns.right = Math.max(0, player.cooldowns.right - dtMs)
}

/** One shot straight ahead, along the heading. */
export function fireFront(world: World, player: PlayerShip, stats: WeaponStats): void {
  const forward = headingToVector(player.rotation)

  spawnProjectile(world, {
    owner: 'player',
    x: player.x + forward.x * stats.muzzleOffsetPx,
    y: player.y + forward.y * stats.muzzleOffsetPx,
    vx: forward.x * stats.projectileSpeed,
    vy: forward.y * stats.projectileSpeed,
    radius: stats.projectileRadius,
    damage: stats.damage,
    lifeMs: stats.lifeMs,
  })
}

/** A volley of `count` parallel shots perpendicular to the heading, spaced `spread` apart. */
export function fireBroadside(
  world: World,
  player: PlayerShip,
  flank: Flank,
  stats: SideWeaponStats,
): void {
  const forward = headingToVector(player.rotation)
  const starboard = starboardVector(player.rotation)
  const centreIndex = (stats.count - 1) / 2

  for (let index = 0; index < stats.count; index += 1) {
    // Shots are spread *along the hull*, so the volley stays parallel to itself.
    const alongHull = (index - centreIndex) * stats.spread

    spawnProjectile(world, {
      owner: 'player',
      x: player.x + starboard.x * flank * stats.muzzleOffsetPx + forward.x * alongHull,
      y: player.y + starboard.y * flank * stats.muzzleOffsetPx + forward.y * alongHull,
      vx: starboard.x * flank * stats.projectileSpeed,
      vy: starboard.y * flank * stats.projectileSpeed,
      radius: stats.projectileRadius,
      damage: stats.damage,
      lifeMs: stats.lifeMs,
    })
  }
}

/** Player weapons: fires whichever mount is asked for and is off cooldown. */
export function weaponsSystem(world: World, dtMs: number, intent: ShipIntent): void {
  const player = world.player
  const weapons = world.config.player.weapons

  tickCooldowns(player, dtMs)

  if (intent.fireFront && player.cooldowns.front === 0) {
    fireFront(world, player, weapons.front)
    player.cooldowns.front = weapons.front.cooldownMs
  }

  if (intent.fireLeft && player.cooldowns.left === 0) {
    fireBroadside(world, player, PORT, weapons.side)
    player.cooldowns.left = weapons.side.cooldownMs
  }

  if (intent.fireRight && player.cooldowns.right === 0) {
    fireBroadside(world, player, STARBOARD, weapons.side)
    player.cooldowns.right = weapons.side.cooldownMs
  }
}

/** Reach a weapon actually delivers, derived from speed and lifetime. */
export function effectiveRangePx(stats: WeaponStats): number {
  return (stats.projectileSpeed * stats.lifeMs) / MS_PER_SECOND
}
