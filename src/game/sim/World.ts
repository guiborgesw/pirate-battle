/**
 * The simulation world: plain data plus the ordered list of systems that mutate it.
 *
 * `stepWorld` is the single entry point. It never reads a clock, never touches the DOM and never
 * allocates views — the renderer observes it afterwards. That separation is what the milestone
 * checks rely on: `window.__pb.advance(ms)` can run the real rules with no browser involved.
 */
import type { Circle, GameConfig, IslandDefinition } from '../../config/gameConfig.ts'
import { createRng, type Rng } from '../core/Rng.ts'
import type { ShipIntent } from '../core/intents.ts'
import type { EnemyShip, PlayerShip, Projectile, Ship } from './entities.ts'
import { aiSystem } from './systems/ai.ts'
import { chaserContactSystem, projectileImpactSystem } from './systems/combat.ts'
import { islandCollisionSystem, projectileIslandSystem } from './systems/collision.ts'
import { applyArenaBounds, movementSystem } from './systems/movement.ts'
import { projectilesSystem } from './systems/projectiles.ts'
import { spawnSystem } from './systems/spawn.ts'
import { weaponsSystem } from './systems/weapons.ts'

export type IslandCircle = Circle & {
  readonly islandId: string
  readonly variant: number
}

export type SimEvent =
  | { readonly type: 'entityRemoved'; readonly entity: 'projectile'; readonly id: number }
  | { readonly type: 'entityRemoved'; readonly entity: 'enemy'; readonly id: number }

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

type Removable = { readonly id: number; alive: boolean }

/**
 * Removes dead entities in place and reports each one. Compacting once, at the end of the step,
 * means no system ever holds a stale array index, and the reported ids let the renderer release
 * pooled views exactly once.
 */
function compactList(list: Removable[], entity: 'projectile' | 'enemy', events: SimEvent[]): void {
  let write = 0

  for (const item of list) {
    if (!item.alive) {
      events.push({ type: 'entityRemoved', entity, id: item.id })
      continue
    }

    list[write] = item
    write += 1
  }

  list.length = write
}

/** The single removal point of the step. */
export function compact(world: World): void {
  compactList(world.projectiles, 'projectile', world.events)
  compactList(world.enemies, 'enemy', world.events)
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

  // M8: match clock, end conditions and the freeze that follows.
}
