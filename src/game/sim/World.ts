/**
 * The simulation world: plain data plus the ordered list of systems that mutate it.
 *
 * `stepWorld` is the single entry point. It never reads a clock, never touches the DOM and never
 * allocates views — the renderer observes it afterwards. That separation is what the milestone
 * checks rely on: `window.__pb.advance(ms)` can run the real rules with no browser involved.
 */
import type { Circle, GameConfig, IslandDefinition } from '../../config/gameConfig.ts'
import { createRng, type Rng } from '../core/Rng.ts'
import { MS_PER_SECOND } from '../core/math.ts'
import type { ShipIntent } from '../core/intents.ts'
import type {
  DamageSource,
  EnemyShip,
  GunMount,
  KilledBy,
  PlayerShip,
  Projectile,
  ProjectileDeathReason,
  ProjectileOwner,
  Ship,
} from './entities.ts'
import { aiSystem } from './systems/ai.ts'
import { chaserContactSystem, projectileImpactSystem } from './systems/combat.ts'
import { islandCollisionSystem, projectileIslandSystem } from './systems/collision.ts'
import { applyArenaBounds, movementSystem } from './systems/movement.ts'
import { matchSystem, type SimEndReason } from './systems/match.ts'
import { projectilesSystem } from './systems/projectiles.ts'
import { spawnSystem } from './systems/spawn.ts'
import { weaponsSystem } from './systems/weapons.ts'

export type IslandCircle = Circle & {
  readonly islandId: string
  readonly variant: number
}

/**
 * Everything the step reports to the outside world. The events carry enough payload for the render
 * and audio layers to place effects exactly — where a shot left the gun, where it ended and why,
 * where damage landed and whether it killed — so neither layer has to re-derive sim geometry.
 */
export type SimEvent =
  | {
      readonly type: 'entityRemoved'
      readonly entity: 'projectile'
      readonly id: number
      readonly x: number
      readonly y: number
      readonly owner: ProjectileOwner
      readonly reason: ProjectileDeathReason
    }
  | {
      readonly type: 'entityRemoved'
      readonly entity: 'enemy'
      readonly id: number
      readonly x: number
      readonly y: number
      readonly killedBy: KilledBy | undefined
    }
  | {
      readonly type: 'shotFired'
      /** Id of the shot that was created; the feedback layer picks its sound variant from it. */
      readonly id: number
      readonly owner: ProjectileOwner
      readonly mount: GunMount
      readonly x: number
      readonly y: number
      readonly headingRad: number
    }
  | {
      readonly type: 'damage'
      readonly target: 'player' | 'enemy'
      readonly targetId: number
      readonly x: number
      readonly y: number
      readonly amount: number
      readonly lethal: boolean
      readonly source: DamageSource
    }

export type World = {
  readonly config: Readonly<GameConfig>
  readonly rng: Rng
  readonly islands: readonly IslandCircle[]
  readonly player: PlayerShip
  readonly enemies: EnemyShip[]
  readonly projectiles: Projectile[]
  /**
   * Entity removals produced by the current step. The renderer consumes them with `consumeEvents()`
   * so pooled views are released exactly once; the array survives until then, which matters when one
   * animation frame runs several fixed steps.
   */
  events: SimEvent[]
  simTimeMs: number
  nextEntityId: number
  /** Shots the *player* fired this match; enemy fire is not counted here. */
  shotsFired: number
  /** Points from enemies the player destroyed. Chaser self-destructs never move this. */
  score: number
  /** Milliseconds left on the match clock. The simulation, not the React clock, owns this. */
  remainingMs: number
  /** True once the buzzer has sounded or the player sank; `stepWorld` refuses to run after that. */
  ended: boolean
  endReason: SimEndReason | undefined
  /** Milliseconds accumulated towards the next spawn. */
  spawnElapsedMs: number
  /** How many enemies the schedule has placed — the first-two-kinds guarantee reads this. */
  spawnsMade: number
}

export type WorldOptions = {
  readonly config: Readonly<GameConfig>
  readonly seed: number
}

function flattenIslands(definitions: readonly IslandDefinition[]): IslandCircle[] {
  const circles: IslandCircle[] = []

  for (const island of definitions) {
    for (const circle of island.circles) {
      circles.push({ ...circle, islandId: island.id, variant: island.variant })
    }
  }

  return circles
}

export function createWorld(options: WorldOptions): World {
  const { config } = options
  const player: PlayerShip = {
    id: 1,
    kind: 'player',
    x: config.arena.width / 2,
    y: config.arena.height / 2,
    rotation: 0,
    prevX: config.arena.width / 2,
    prevY: config.arena.height / 2,
    prevRotation: 0,
    vx: 0,
    vy: 0,
    radius: config.player.radius,
    hp: config.player.maxHp,
    maxHp: config.player.maxHp,
    alive: true,
    cooldowns: { front: 0, left: 0, right: 0 },
  }

  return {
    config,
    rng: createRng(options.seed),
    islands: flattenIslands(config.islands),
    player,
    enemies: [],
    projectiles: [],
    events: [],
    simTimeMs: 0,
    nextEntityId: 2,
    shotsFired: 0,
    score: 0,
    remainingMs: config.match.durationSec * MS_PER_SECOND,
    ended: false,
    endReason: undefined,
    spawnElapsedMs: 0,
    spawnsMade: 0,
  }
}

/** Every living ship — the input of collision and targeting rules. */
export function allShips(world: World): Ship[] {
  return [world.player, ...world.enemies]
}

/** Copies the current transform so the renderer can interpolate between steps. */
export function capturePreviousTransforms(world: World): void {
  for (const ship of allShips(world)) {
    ship.prevX = ship.x
    ship.prevY = ship.y
    ship.prevRotation = ship.rotation
  }

  for (const projectile of world.projectiles) {
    projectile.prevX = projectile.x
    projectile.prevY = projectile.y
  }
}

/**
 * Removes dead projectiles in place and reports each one with the place and reason it died, so the
 * render layer can put a splash, a puff of dust or nothing at all exactly where it belongs.
 */
function compactProjectiles(list: Projectile[], events: SimEvent[]): void {
  let write = 0

  for (const projectile of list) {
    if (!projectile.alive) {
      events.push({
        type: 'entityRemoved',
        entity: 'projectile',
        id: projectile.id,
        x: projectile.x,
        y: projectile.y,
        owner: projectile.owner,
        reason: projectile.deathReason,
      })
      continue
    }

    list[write] = projectile
    write += 1
  }

  list.length = write
}

/** Same, for the ships: the position is where the explosion goes, `killedBy` decides the score sound. */
function compactEnemies(list: EnemyShip[], events: SimEvent[]): void {
  let write = 0

  for (const enemy of list) {
    if (!enemy.alive) {
      events.push({
        type: 'entityRemoved',
        entity: 'enemy',
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        killedBy: enemy.killedBy,
      })
      continue
    }

    list[write] = enemy
    write += 1
  }

  list.length = write
}

/** The single removal point of the step. */
export function compact(world: World): void {
  compactProjectiles(world.projectiles, world.events)
  compactEnemies(world.enemies, world.events)
}

/** Hands the accumulated events to the caller and starts a fresh batch. */
export function consumeEvents(world: World): SimEvent[] {
  const events = world.events
  world.events = []
  return events
}

/**
 * Runs one fixed step of the simulation. The order is the contract:
 *
 * player input → enemy steering → arena and island collisions → player guns → projectiles fly →
 * impacts and the Chaser ram → spawn schedule → one `compact()`.
 *
 * Impacts land before the schedule so a ship that spawns this step cannot be hit during its own spawn
 * step; `compact()` last means no system ever reads a half-removed array.
 */
export function stepWorld(world: World, dtMs: number, intent: ShipIntent): void {
  // Frozen. After the buzzer nothing moves, fires, spawns or scores (spec §2) — and the simulation
  // clock stops with it, so the HUD cannot keep counting down a match that is over.
  if (world.ended) return

  capturePreviousTransforms(world)
  world.simTimeMs += dtMs

  movementSystem(world, dtMs, intent)
  aiSystem(world, dtMs)
  applyArenaBounds(world)
  islandCollisionSystem(world)

  weaponsSystem(world, dtMs, intent)
  projectilesSystem(world, dtMs)
  projectileIslandSystem(world)
  projectileImpactSystem(world)
  chaserContactSystem(world)

  spawnSystem(world, dtMs)
  compact(world)
  matchSystem(world, dtMs)
}
