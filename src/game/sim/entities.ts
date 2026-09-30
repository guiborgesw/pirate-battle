/**
 * Entity shapes owned by the `World`. Plain objects in arrays: no classes, no hidden state, and
 * everything a system needs is visible in the type.
 *
 * `prevX`/`prevY`/`prevRotation` exist so the renderer can interpolate between the last two fixed
 * steps (see `docs/plan-deviations.md` A4 — the brief asked for interpolation without providing the
 * state it needs).
 */

export type ShipKind = 'player' | 'chaser' | 'shooter'

export type KilledBy = 'player' | 'self'

export type Ship = {
  readonly id: number
  readonly kind: ShipKind
  x: number
  y: number
  rotation: number
  prevX: number
  prevY: number
  prevRotation: number
  vx: number
  vy: number
  readonly radius: number
  hp: number
  readonly maxHp: number
  alive: boolean
}

export type EnemyShip = Ship & {
  readonly kind: 'chaser' | 'shooter'
  /** Milliseconds until this ship may fire again. */
  cooldownMs: number
  /** How this ship died; only `player` scores a point (challenge spec §2). */
  killedBy: KilledBy | undefined
}

export type PlayerShip = Ship & {
  readonly kind: 'player'
  /** Milliseconds until each weapon may fire again. */
  cooldowns: { front: number; left: number; right: number }
}

export type ProjectileOwner = 'player' | 'enemy'

export type Projectile = {
  readonly id: number
  readonly owner: ProjectileOwner
  x: number
  y: number
  prevX: number
  prevY: number
  vx: number
  vy: number
  readonly radius: number
  readonly damage: number
  /** Remaining lifetime in milliseconds; the projectile dies when it reaches zero. */
  lifeMs: number
  alive: boolean
}
