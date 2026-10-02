/**
 * Every gameplay number lives here (challenge spec §3: balance changes must never require
 * touching system logic). A match reads a deep-frozen snapshot created by `createMatchConfig`.
 */
import { DEFAULT_OPTIONS, type GameOptions } from './optionsSchema.ts'

export type Circle = {
  readonly x: number
  readonly y: number
  readonly radius: number
}

export type ShipStats = {
  readonly maxHp: number
  readonly speed: number
  readonly turnSpeedRad: number
  readonly radius: number
}

export type WeaponStats = {
  readonly damage: number
  readonly cooldownMs: number
  readonly projectileSpeed: number
  readonly rangePx: number
  readonly lifeMs: number
  readonly projectileRadius: number
  /**
   * How far from the ship centre the shot appears, along its firing direction. Matches the
   * `cannon` sprite offset so the ball leaves the barrel instead of the deck centre.
   */
  readonly muzzleOffsetPx: number
}

export type SideWeaponStats = WeaponStats & {
  /** Distance between the parallel projectiles of a broadside volley. */
  readonly spread: number
  readonly count: number
}

export type IslandDefinition = {
  readonly id: string
  /** Selects which tile blob the renderer draws for this island. */
  readonly variant: number
  /** A ship is pushed out of every circle it overlaps; 2-4 circles make one island. */
  readonly circles: readonly Circle[]
}

export type GameConfig = {
  readonly arena: { readonly width: number; readonly height: number }
  readonly match: { readonly durationSec: number }
  readonly spawn: {
    readonly intervalMs: number
    readonly weights: { readonly chaser: number; readonly shooter: number }
    readonly minDistanceFromPlayer: number
    readonly maxAlive: number
    /** Width of the band along the arena edge where enemies may appear. */
    readonly edgeBandPx: number
    /** How many random edge candidates are tried before a spawn is skipped. */
    readonly candidates: number
  }
  readonly islands: readonly IslandDefinition[]
  readonly enemyAi: {
    /** How far ahead the avoidance probe looks, in ship radii (plan §1.3: 2x radius). */
    readonly probeRadii: number
    /** How far an enemy may swerve off its target heading when that probe is blocked. */
    readonly swerveRad: number
    /** A Shooter only pulls the trigger with the player inside this cone. */
    readonly aimToleranceRad: number
  }
  readonly player: ShipStats & {
    readonly weapons: {
      readonly front: WeaponStats
      readonly side: SideWeaponStats
    }
  }
  readonly chaser: ShipStats & {
    readonly contactDamage: number
  }
  readonly shooter: ShipStats & {
    readonly weapon: WeaponStats
    readonly attackRange: number
    readonly preferredRange: number
  }
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  arena: { width: 1280, height: 720 },
  match: { durationSec: DEFAULT_OPTIONS.durationSec },
  spawn: {
    intervalMs: DEFAULT_OPTIONS.spawnIntervalMs,
    weights: { chaser: 0.6, shooter: 0.4 },
    minDistanceFromPlayer: 340,
    maxAlive: 12,
    edgeBandPx: 72,
    candidates: 30,
  },
  islands: [
    {
      id: 'west-shelf',
      variant: 0,
      circles: [
        { x: 170, y: 236, radius: 104 },
        { x: 286, y: 206, radius: 78 },
        { x: 214, y: 338, radius: 62 },
      ],
    },
    {
      id: 'north-reef',
      variant: 1,
      circles: [
        { x: 700, y: 152, radius: 96 },
        { x: 806, y: 188, radius: 66 },
      ],
    },
    {
      id: 'south-east-cay',
      variant: 2,
      circles: [
        { x: 1010, y: 556, radius: 118 },
        { x: 878, y: 596, radius: 74 },
        { x: 1092, y: 470, radius: 58 },
        { x: 948, y: 470, radius: 46 },
      ],
    },
  ],
  enemyAi: { probeRadii: 2, swerveRad: 0.35, aimToleranceRad: 0.25 },
  player: {
    maxHp: 100,
    speed: 148,
    turnSpeedRad: 2.5,
    radius: 38,
    weapons: {
      front: {
        damage: 34,
        cooldownMs: 480,
        projectileSpeed: 560,
        rangePx: 640,
        lifeMs: 1150,
        projectileRadius: 5,
        muzzleOffsetPx: 30,
      },
      side: {
        damage: 22,
        cooldownMs: 900,
        projectileSpeed: 470,
        rangePx: 470,
        lifeMs: 1000,
        projectileRadius: 5,
        muzzleOffsetPx: 28,
        spread: 26,
        count: 3,
      },
    },
  },
  chaser: {
    maxHp: 40,
    speed: 178,
    turnSpeedRad: 2.2,
    radius: 32,
    contactDamage: 25,
  },
  shooter: {
    maxHp: 56,
    speed: 122,
    turnSpeedRad: 1.8,
    radius: 34,
    weapon: {
      damage: 12,
      cooldownMs: 1600,
      projectileSpeed: 390,
      rangePx: 560,
      lifeMs: 1450,
      projectileRadius: 5,
      muzzleOffsetPx: 26,
    },
    attackRange: 470,
    preferredRange: 330,
  },
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value

  for (const key of Object.keys(value)) {
    const nested: unknown = Reflect.get(value, key)
    deepFreeze(nested)
  }

  return Object.freeze(value)
}

/**
 * Snapshot taken once per match. Systems read only this object, so changing options later
 * affects the next match and never the running one.
 */
export function createMatchConfig(options: GameOptions = DEFAULT_OPTIONS): Readonly<GameConfig> {
  const snapshot: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    match: { durationSec: options.durationSec },
    spawn: { ...DEFAULT_GAME_CONFIG.spawn, intervalMs: options.spawnIntervalMs },
  }

  return deepFreeze(snapshot)
}

/** Stable key used to group ranking entries that were played with the same configuration. */
export function configKey(config: Pick<GameConfig, 'match' | 'spawn'>): string {
  return configKeyFor(config.match.durationSec, config.spawn.intervalMs)
}

/** Same key from the two raw values, so the API layer and the fixtures do not need a whole config. */
export function configKeyFor(durationSec: number, spawnIntervalMs: number): string {
  return `d${durationSec}-s${spawnIntervalMs}`
}

/** Human-readable configuration line shown above the ranking (see the challenge mockups). */
export function configLabel(config: Pick<GameConfig, 'match' | 'spawn'>): string {
  return configLabelFor(config.match.durationSec, config.spawn.intervalMs)
}

export function configLabelFor(durationSec: number, spawnIntervalMs: number): string {
  const spawnSeconds = spawnIntervalMs / 1000
  const spawnText = Number.isInteger(spawnSeconds) ? `${spawnSeconds}` : spawnSeconds.toFixed(1)
  return `${durationSec} SECOND BATTLES · ${spawnText} SECOND SPAWN INTERVAL`
}
