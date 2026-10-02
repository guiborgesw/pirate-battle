/**
 * Dependency-free self-check for pure logic (config snapshots, option validation, storage
 * fallbacks). It exists because the brief ships no unit-test framework: the Playwright suite
 * covers the integrated behaviours, and this covers the small pure functions cheaply.
 *
 *   pnpm self-check
 */
import {
  configKey,
  configLabel,
  createMatchConfig,
  DEFAULT_GAME_CONFIG,
  type GameConfig,
} from '../src/config/gameConfig.ts'
import { createClock } from '../src/game/core/Clock.ts'
import { createFixedStepLoop } from '../src/game/core/FixedStepLoop.ts'
import { createRng } from '../src/game/core/Rng.ts'
import { EMPTY_INTENT, type ShipIntent } from '../src/game/core/intents.ts'
import { angleDelta, distanceSquared, headingToVector } from '../src/game/core/math.ts'
import { headingToPoint } from '../src/game/sim/systems/ai.ts'
import { addEnemy, findBerth } from '../src/game/sim/systems/spawn.ts'
import { createWorld, stepWorld, type World } from '../src/game/sim/World.ts'
import { consumeEvents } from '../src/game/sim/World.ts'
import { effectiveRangePx } from '../src/game/sim/systems/weapons.ts'
import {
  ART_FACING_OFFSET_RAD,
  BOW_CANNON_ROTATION_RAD,
  hullTierFor,
  shipAppearance,
} from '../src/config/shipAppearance.ts'
import {
  columnHeights,
  decodePng,
  frameRect,
  mean,
  rowWidths,
  type SheetJson,
} from './lib/decode-png.ts'
import { ATLASES, SOUND_KEYS, type AtlasKey } from '../src/game/assets/manifest.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clampOptionValue,
  DEFAULT_OPTIONS,
  formatOptionValue,
  parseOptions,
  parseStoredOptions,
  stepOptionValue,
} from '../src/config/optionsSchema.ts'
import {
  configureStorage,
  readJson,
  resetStorageBackend,
  writeJson,
  type StorageLike,
} from '../src/storage/localStore.ts'
import { loadOptions, saveOptions } from '../src/storage/settings.ts'

let failures = 0

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ok    ${label}`)
    return
  }
  failures += 1
  console.error(`  FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

section('config snapshot')
const snapshot = createMatchConfig({ durationSec: 180, spawnIntervalMs: 4500 })

check('durationSec applied', snapshot.match.durationSec === 180, String(snapshot.match.durationSec))
check('intervalMs applied', snapshot.spawn.intervalMs === 4500, String(snapshot.spawn.intervalMs))
check('snapshot itself frozen', Object.isFrozen(snapshot))
check('nested spawn frozen', Object.isFrozen(snapshot.spawn))
check('nested weights frozen', Object.isFrozen(snapshot.spawn.weights))
check('islands array frozen', Object.isFrozen(snapshot.islands))

const firstIsland = snapshot.islands[0]
check(
  'island circles frozen',
  firstIsland !== undefined &&
    Object.isFrozen(firstIsland.circles) &&
    Object.isFrozen(firstIsland.circles[0]),
)

const mutableMatch = snapshot.match as unknown as { durationSec: number }
let rejectedWrite = false
try {
  mutableMatch.durationSec = 99
} catch {
  rejectedWrite = true
}

check('writes to the snapshot are rejected', rejectedWrite && snapshot.match.durationSec === 180)
check('defaults untouched by a snapshot', DEFAULT_GAME_CONFIG.match.durationSec === 120)
check(
  'arena defaults',
  DEFAULT_GAME_CONFIG.arena.width === 1280 && DEFAULT_GAME_CONFIG.arena.height === 720,
)
check('islands defined', DEFAULT_GAME_CONFIG.islands.length === 3)
check(
  'every island has 2-4 circles',
  DEFAULT_GAME_CONFIG.islands.every(
    (island) => island.circles.length >= 2 && island.circles.length <= 4,
  ),
)
check('configKey format', configKey(snapshot) === 'd180-s4500', configKey(snapshot))
check(
  'configKey default',
  configKey(createMatchConfig()) === 'd120-s3000',
  configKey(createMatchConfig()),
)
check(
  'configLabel is human readable',
  configLabel(snapshot) === '180 SECOND BATTLES · 4.5 SECOND SPAWN INTERVAL',
  configLabel(snapshot),
)

section('option validation')
const valid = parseOptions({ durationSec: '150', spawnIntervalMs: 6000 })
check(
  'accepts numeric strings',
  valid.ok && valid.options.durationSec === 150 && valid.options.spawnIntervalMs === 6000,
)

const tooLong = parseOptions({ durationSec: 181, spawnIntervalMs: 3000 })
check(
  'rejects duration above 180',
  !tooLong.ok && tooLong.errors.some((error) => error.field === 'durationSec'),
)

const tooShort = parseOptions({ durationSec: 59, spawnIntervalMs: 3000 })
check('rejects duration below 60', !tooShort.ok)

const fractional = parseOptions({ durationSec: 120.5, spawnIntervalMs: 3000 })
check('rejects fractional duration', !fractional.ok)

const offStep = parseOptions({ durationSec: 120, spawnIntervalMs: 3300 })
check('rejects off-step spawn interval', !offStep.ok)

const lowInterval = parseOptions({ durationSec: 120, spawnIntervalMs: 0 })
check('rejects non-positive spawn interval', !lowInterval.ok)

const junk = parseOptions({ durationSec: 'abc', spawnIntervalMs: null })
check('reports one error per field', !junk.ok && junk.errors.length === 2)

const notAnObject = parseOptions('nope')
check('rejects non-objects', !notAnObject.ok)

check('clamps below min', clampOptionValue('durationSec', 10) === 60)
check('clamps above max', clampOptionValue('spawnIntervalMs', 99999) === 10000)
check(
  'snaps to the step',
  clampOptionValue('spawnIntervalMs', 3330) === 3500,
  String(clampOptionValue('spawnIntervalMs', 3330)),
)
check('steps up', stepOptionValue('spawnIntervalMs', 10000, 1) === 10000)
check('steps down', stepOptionValue('spawnIntervalMs', 1000, -1) === 1000)
check(
  'format shows spawn seconds as "3 s"',
  formatOptionValue('spawnIntervalMs', 3000) === '3 s',
  formatOptionValue('spawnIntervalMs', 3000),
)
check(
  'format keeps half seconds',
  formatOptionValue('spawnIntervalMs', 4500) === '4.5 s',
  formatOptionValue('spawnIntervalMs', 4500),
)
check('format uses seconds for duration', formatOptionValue('durationSec', 120) === '120 s')
check(
  'stored options reject junk',
  parseStoredOptions({ durationSec: -1, spawnIntervalMs: 3000 }) === undefined,
)

section('storage')
resetStorageBackend()
check('writes through the in-memory fallback', writeJson('lastResult', { score: 12 }))
const roundTrip = readJson('lastResult')
check(
  'reads back what was written',
  roundTrip.found && JSON.stringify(roundTrip.value) === '{"score":12}',
)
check('missing keys are reported as missing', !readJson('playerId').found)

const fakeStore = new Map<string, string>()
const fake: StorageLike = {
  getItem: (key) => fakeStore.get(key) ?? null,
  setItem: (key, value) => {
    fakeStore.set(key, value)
  },
  removeItem: (key) => {
    fakeStore.delete(key)
  },
}

configureStorage(fake)
check('injected backend receives writes', saveOptions({ durationSec: 90, spawnIntervalMs: 1500 }))
check('injected backend stores the versioned key', fakeStore.has('pb.options.v1'))
check('settings round-trip through the injected backend', loadOptions().durationSec === 90)

fakeStore.set('pb.options.v1', '{"durationSec": 42, oops')
check('corrupt JSON is reported as corrupt', !readJson('options').found)
check(
  'corrupt settings fall back to defaults',
  loadOptions().durationSec === DEFAULT_OPTIONS.durationSec,
)

fakeStore.set('pb.options.v1', '{"durationSec": 5, "spawnIntervalMs": 1}')
check(
  'out-of-range settings fall back to defaults',
  loadOptions().spawnIntervalMs === DEFAULT_OPTIONS.spawnIntervalMs,
)

const broken: StorageLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

configureStorage(broken)
const brokenRead = readJson('options')
check(
  'throwing backend degrades to unavailable',
  !brokenRead.found && brokenRead.reason === 'unavailable',
)
check('throwing backend does not break writes', !saveOptions(DEFAULT_OPTIONS))
check(
  'throwing backend still yields defaults',
  loadOptions().durationSec === DEFAULT_OPTIONS.durationSec,
)
resetStorageBackend()

section('clock')
const stepMs = 1000 / 60

{
  const clock = createClock({ stepMs, maxFrameMs: 250 })

  const single = clock.advance(stepMs)
  check('one 16.7 ms frame runs one step', single.steps === 1, String(single.steps))
  check('alpha stays inside [0, 1)', single.alpha >= 0 && single.alpha < 1, String(single.alpha))

  const throttled = clock.advance(100)
  check('a 100 ms (throttled) frame runs six steps', throttled.steps === 6, String(throttled.steps))

  const clamped = clock.advance(5000)
  check(
    'a 5 s frame is clamped to 250 ms / 15 steps',
    clamped.clamped && clamped.steps === 15,
    `${clamped.steps} steps, clamped=${String(clamped.clamped)}`,
  )

  check(
    'sim time equals steps x stepMs',
    Math.abs(clock.simTimeMs() - clock.stepCount() * stepMs) < 1e-9,
  )

  clock.clearAccumulator()
  check('half a frame runs no step', clock.advance(stepMs / 2).steps === 0)
  check('the second half completes the step', clock.advance(stepMs / 2).steps === 1)

  clock.reset()
  check('reset clears sim time and steps', clock.simTimeMs() === 0 && clock.stepCount() === 0)

  // Regression guard: 1000/60 is not exact in binary floating point, so a naive floor() division
  // drops a step at frame boundaries (60 frames would advance 999.99 ms instead of 1000 ms).
  const drift = createClock({ stepMs, maxFrameMs: 250 })
  for (let frame = 0; frame < 60; frame += 1) drift.advance(stepMs)
  check(
    '60 frames advance exactly one second of sim time',
    Math.abs(drift.simTimeMs() - 1000) < 1e-9,
    String(drift.simTimeMs()),
  )
  check(
    'stepsFor is exact at the boundary',
    drift.stepsFor(2000) === 120,
    String(drift.stepsFor(2000)),
  )
}

section('fixed-step loop')

function runFrames(deltas: readonly number[]): {
  steps: number
  renders: number
  lastAlpha: number
} {
  const clock = createClock({ stepMs, maxFrameMs: 250 })
  let steps = 0
  let renders = 0
  let lastAlpha = -1
  let frame: ((deltaMs: number) => void) | undefined

  const loop = createFixedStepLoop({
    clock,
    onStep: () => {
      steps += 1
    },
    onRender: (alpha) => {
      renders += 1
      lastAlpha = alpha
    },
    scheduler: {
      start: (callback) => {
        frame = callback
      },
      stop: () => {
        frame = undefined
      },
    },
  })

  loop.start()
  for (const delta of deltas) frame?.(delta)
  loop.stop()

  check('stopping the loop detaches the scheduler', frame === undefined)

  return { steps, renders, lastAlpha }
}

const sixtySmallFrames = runFrames(Array.from({ length: 60 }, () => stepMs))
const tenBigFrames = runFrames(Array.from({ length: 10 }, () => stepMs * 6))

check('60 small frames run 60 steps', sixtySmallFrames.steps === 60, String(sixtySmallFrames.steps))
check(
  '10 big frames run the same 60 steps (frame rate does not change sim speed)',
  tenBigFrames.steps === 60,
  String(tenBigFrames.steps),
)
check(
  'rendering happens once per frame',
  sixtySmallFrames.renders === 60 && tenBigFrames.renders === 10,
  `${sixtySmallFrames.renders}/${tenBigFrames.renders}`,
)
check(
  'render alpha is the leftover fraction',
  sixtySmallFrames.lastAlpha >= 0 && sixtySmallFrames.lastAlpha < 1,
)

{
  const clock = createClock({ stepMs, maxFrameMs: 250 })
  let steps = 0
  const loop = createFixedStepLoop({
    clock,
    onStep: () => {
      steps += 1
    },
    onRender: () => undefined,
    scheduler: { start: () => undefined, stop: () => undefined },
  })

  let threw = false
  try {
    loop.advance(1000)
  } catch {
    threw = true
  }
  check('advance() refuses to run without manual mode', threw)

  loop.setManual(true)
  check('manual advance runs the exact number of steps', loop.advance(2000) === 120, String(steps))
  check('manual advance ignores the frame clamp', loop.advance(stepMs) === 1)
  check('manual mode reports itself', loop.isManual())
}

{
  const clock = createClock({ stepMs, maxFrameMs: 250 })
  let frames: ((deltaMs: number) => void) | undefined
  let steps = 0

  const loop = createFixedStepLoop({
    clock,
    onStep: () => {
      steps += 1
    },
    onRender: () => undefined,
    scheduler: {
      start: (callback) => {
        frames = callback
      },
      stop: () => undefined,
    },
  })

  loop.start()
  loop.ignoreNextFrame()
  frames?.(5000)
  check('the frame after a resume is dropped (no catch-up burst)', steps === 0, String(steps))
  frames?.(stepMs)
  check('the next frame runs normally', steps === 1, String(steps))
}

section('movement, bounds and islands')

const testConfig = createMatchConfig({ durationSec: 120, spawnIntervalMs: 3000 })
/** Movement is asserted in open water so an island collision cannot mask a speed regression. */
const openWater: Readonly<GameConfig> = { ...testConfig, islands: [] }
const forwardIntent: ShipIntent = { ...EMPTY_INTENT, forward: true }
const rightIntent: ShipIntent = { ...EMPTY_INTENT, rotateRight: true }

function runSeconds(world: World, seconds: number, intent: ShipIntent): void {
  const steps = Math.round(seconds * 60)
  for (let step = 0; step < steps; step += 1) stepWorld(world, stepMs, intent)
}

{
  const world = createWorld({ config: openWater, seed: 1 })
  const startX = world.player.x
  const startY = world.player.y

  check(
    'player starts at the arena centre',
    startX === 640 && startY === 360,
    `${startX},${startY}`,
  )

  runSeconds(world, 1, forwardIntent)
  const travelled = Math.hypot(world.player.x - startX, world.player.y - startY)

  check(
    'one second of throttle covers exactly speed x 1 s',
    Math.abs(travelled - testConfig.player.speed) < 0.5,
    `${travelled.toFixed(2)} px vs ${testConfig.player.speed}`,
  )
  check(
    'heading 0 sails straight up (-Y)',
    world.player.y < startY && Math.abs(world.player.x - startX) < 1e-9,
    `${world.player.x},${world.player.y}`,
  )
}

{
  const world = createWorld({ config: openWater, seed: 1 })
  runSeconds(world, 1, rightIntent)
  check(
    'one second of turn rotates by turnSpeedRad',
    Math.abs(world.player.rotation - testConfig.player.turnSpeedRad) < 1e-9,
    String(world.player.rotation),
  )
}

{
  const world = createWorld({ config: openWater, seed: 1 })
  runSeconds(world, 30, forwardIntent)

  check(
    'cannot leave the arena (top edge)',
    world.player.y >= world.player.radius - 1e-9,
    String(world.player.y),
  )
  check(
    'stays inside the arena horizontally',
    world.player.x >= world.player.radius &&
      world.player.x <= testConfig.arena.width - world.player.radius,
  )
}

{
  const world = createWorld({ config: testConfig, seed: 1 })
  let worstOverlap = 0
  let offending = ''

  for (const circle of world.islands) {
    world.player.x = circle.x
    world.player.y = circle.y
    world.player.vx = 0
    world.player.vy = 0
    stepWorld(world, stepMs, EMPTY_INTENT)

    const distance = Math.hypot(world.player.x - circle.x, world.player.y - circle.y)
    const overlap = circle.radius + world.player.radius - distance

    if (overlap > worstOverlap) {
      worstOverlap = overlap
      offending = circle.islandId
    }
  }

  check(
    'a ship dropped on an island centre is pushed out',
    worstOverlap < 1e-6,
    `${offending} overlap ${worstOverlap.toFixed(4)} px`,
  )
}

{
  // Acceptance criterion: ram an island for two minutes of simulated time and never overlap it.
  const world = createWorld({ config: testConfig, seed: 1 })
  const target = world.islands[0]

  if (target === undefined) throw new Error('the default config ships no islands')

  world.player.x = target.x
  world.player.y = target.y + target.radius + 200
  world.player.rotation = 0

  let deepest = 0

  for (let step = 0; step < 60 * 120; step += 1) {
    stepWorld(world, stepMs, forwardIntent)

    for (const circle of world.islands) {
      const distance = Math.hypot(world.player.x - circle.x, world.player.y - circle.y)
      deepest = Math.max(deepest, circle.radius + world.player.radius - distance)
    }

    if (world.player.y < world.player.radius) break
  }

  check(
    '120 s of ramming an island never enters it',
    deepest <= 1e-6,
    `deepest penetration ${deepest.toFixed(4)} px`,
  )
}

{
  const maxShipRadius = Math.max(
    testConfig.player.radius,
    testConfig.chaser.radius,
    testConfig.shooter.radius,
  )
  const world = createWorld({ config: testConfig, seed: 1 })
  let minMargin = Number.POSITIVE_INFINITY

  for (const circle of world.islands) {
    minMargin = Math.min(
      minMargin,
      circle.x - circle.radius,
      circle.y - circle.radius,
      testConfig.arena.width - circle.x - circle.radius,
      testConfig.arena.height - circle.y - circle.radius,
    )
  }

  check(
    'every island keeps a ship-sized margin from the arena edge',
    minMargin >= maxShipRadius,
    `margin ${minMargin.toFixed(1)} px vs ship radius ${maxShipRadius}`,
  )
}

section('rng and ship appearance')

{
  const same = [createRng(42), createRng(42)].map((rng) => [rng.next(), rng.next(), rng.next()])
  const other = createRng(43)
  const otherSeq = [other.next(), other.next(), other.next()]

  check('same seed reproduces the sequence', JSON.stringify(same[0]) === JSON.stringify(same[1]))
  check('a different seed diverges', JSON.stringify(same[0]) !== JSON.stringify(otherSeq))

  const rng = createRng(7)
  let inRange = true
  for (let draw = 0; draw < 500; draw += 1) {
    const value = rng.next()
    if (value < 0 || value >= 1) inRange = false
  }
  check('next() stays in [0, 1)', inRange)
  check(
    'pickWeighted never picks a zero weight',
    createRng(1).pickWeighted(['a', 'b'], [1, 0]) === 'a',
  )
}

{
  check('hull tier 1 above 66 %', hullTierFor(1) === 1)
  check('hull tier 2 at 66 %', hullTierFor(0.66) === 2)
  check('hull tier 3 at 33 %', hullTierFor(0.33) === 3)
  check('hull tier 4 when the ship sank', hullTierFor(0, true) === 4)
  check(
    'appearance swaps to the damaged hull',
    shipAppearance('player', 0.3, false).hullFrame === 'hull_large_3',
    shipAppearance('player', 0.3, false).hullFrame,
  )
}

section('weapons and projectiles')

const fireFrontIntent: ShipIntent = { ...EMPTY_INTENT, fireFront: true }
const firePortIntent: ShipIntent = { ...EMPTY_INTENT, fireLeft: true }
const fireStarboardIntent: ShipIntent = { ...EMPTY_INTENT, fireRight: true }
const bow = openWater.player.weapons.front
const battery = openWater.player.weapons.side

{
  // Acceptance: holding fire respects the cooldown, mount by mount.
  const world = createWorld({ config: openWater, seed: 1 })
  const fireTimes: number[] = []
  let previousShots = 0

  for (let step = 0; step < 120; step += 1) {
    stepWorld(world, stepMs, fireFrontIntent)
    if (world.shotsFired > previousShots) {
      previousShots = world.shotsFired
      fireTimes.push(world.simTimeMs)
    }
  }

  const gaps = fireTimes.slice(1).map((time, index) => time - (fireTimes[index] ?? 0))

  check(
    'holding fire never shoots faster than the cooldown',
    gaps.length > 0 && gaps.every((gap) => gap >= bow.cooldownMs - 1e-9),
    `${gaps.length} gaps, shortest ${Math.min(...gaps).toFixed(2)} ms vs cooldown ${bow.cooldownMs}`,
  )
  check(
    'two seconds of held fire yields four to five bow shots',
    world.shotsFired >= 4 && world.shotsFired <= 5,
    `${world.shotsFired} shots`,
  )
}

{
  const world = createWorld({ config: openWater, seed: 1 })
  const startX = world.player.x
  const startY = world.player.y
  stepWorld(world, stepMs, fireFrontIntent)

  const shot = world.projectiles[0]
  const speed = shot === undefined ? 0 : Math.hypot(shot.vx, shot.vy)

  check(
    'the bow fires one shot',
    world.projectiles.length === 1,
    `${world.projectiles.length} shots`,
  )
  check(
    'the bow shot travels at the configured speed',
    Math.abs(speed - bow.projectileSpeed) < 1e-9,
    String(speed),
  )
  check(
    'the bow shot leaves along the heading (straight up)',
    shot?.vx === 0 && shot.vy === -bow.projectileSpeed,
    JSON.stringify({ vx: shot?.vx, vy: shot?.vy }),
  )
  check(
    // `prev*` is the spawn point: the shot already moved once inside the step that created it.
    'the bow shot starts at the muzzle, not at the deck centre',
    shot?.prevY === startY - bow.muzzleOffsetPx && shot.prevX === startX,
    JSON.stringify({ x: shot?.prevX, y: shot?.prevY }),
  )
}

{
  const world = createWorld({ config: openWater, seed: 1 })
  const startX = world.player.x
  const startY = world.player.y
  stepWorld(world, stepMs, firePortIntent)

  const offsetsAlongHull = world.projectiles.map((shot) => shot.prevY - startY)
  const speeds = world.projectiles.map((shot) => Math.hypot(shot.vx, shot.vy))

  check(
    'a broadside is a volley of three',
    world.projectiles.length === battery.count,
    `${world.projectiles.length} shots`,
  )
  check(
    'broadside shots travel perpendicular to the heading',
    world.projectiles.every(
      (shot) => Math.abs(shot.vy) < 1e-9 && shot.vx === -battery.projectileSpeed,
    ),
    JSON.stringify(world.projectiles.map((shot) => ({ vx: shot.vx, vy: shot.vy }))),
  )
  check(
    'the volley travels towards port when the port broadside fires',
    world.projectiles.every((shot) => shot.prevX === startX - battery.muzzleOffsetPx),
  )
  check(
    'the volley is spaced by spread along the hull',
    Math.abs(Math.abs(offsetsAlongHull[1] ?? 0) - Math.abs(offsetsAlongHull[0] ?? 0)) ===
      battery.spread,
    JSON.stringify(offsetsAlongHull),
  )
  check(
    'the volley is centred on the ship',
    Math.abs(offsetsAlongHull.reduce((sum, offset) => sum + offset, 0)) < 1e-9,
  )
  check(
    'every volley shot keeps the configured speed',
    speeds.every((speed) => Math.abs(speed - battery.projectileSpeed) < 1e-9),
  )
}

{
  check(
    'the effective range matches speed x lifetime',
    Math.abs(effectiveRangePx(bow) - bow.rangePx) / bow.rangePx < 0.05,
    `${effectiveRangePx(bow).toFixed(1)} px vs rangePx ${bow.rangePx}`,
  )
}

{
  // The starboard volley mirrors the port one: same size, same speed, opposite flank.
  const portWorld = createWorld({ config: openWater, seed: 1 })
  const starboardWorld = createWorld({ config: openWater, seed: 1 })
  const shipX = portWorld.player.x

  stepWorld(portWorld, stepMs, firePortIntent)
  stepWorld(starboardWorld, stepMs, fireStarboardIntent)

  check(
    'the starboard volley mirrors the port volley',
    starboardWorld.projectiles.length === portWorld.projectiles.length &&
      starboardWorld.projectiles.every((shot) => shot.vx === battery.projectileSpeed) &&
      starboardWorld.projectiles.every((shot) => shot.prevX === shipX + battery.muzzleOffsetPx),
    JSON.stringify(starboardWorld.projectiles.map((shot) => ({ x: shot.prevX, vx: shot.vx }))),
  )
}

{
  // Acceptance: a shot dies once it has flown its range. Needs a lane longer than the range, so the
  // ship fires along the main diagonal from a corner instead of from the middle of the arena.
  const world = createWorld({ config: openWater, seed: 1 })
  const diagonal = Math.PI / 4

  world.player.x = 60
  world.player.y = openWater.arena.height - 60
  world.player.rotation = diagonal
  stepWorld(world, stepMs, fireFrontIntent)

  const shot = world.projectiles[0]
  const forward = headingToVector(diagonal)
  const start = { x: shot?.prevX ?? 0, y: shot?.prevY ?? 0 }
  let furthest = 0
  let steps = 0

  while (world.projectiles.length > 0 && steps < 600) {
    const alive = world.projectiles[0]
    if (alive !== undefined) {
      furthest = Math.max(
        furthest,
        (alive.x - start.x) * forward.x + (alive.y - start.y) * forward.y,
      )
    }
    stepWorld(world, stepMs, EMPTY_INTENT)
    steps += 1
  }

  check(
    'a shot dies after travelling its effective range',
    Math.abs(furthest - effectiveRangePx(bow)) < 20,
    `${furthest.toFixed(1)} px vs ${effectiveRangePx(bow).toFixed(1)} px`,
  )
  check('the shot is removed from the world, not left behind', world.projectiles.length === 0)
}

{
  // Acceptance: a shot vanishes on island contact.
  const world = createWorld({ config: testConfig, seed: 1 })
  const target = world.islands[0]
  if (target === undefined) throw new Error('the default config ships no islands')

  world.player.x = target.x
  world.player.y = target.y + target.radius + 200
  world.player.rotation = 0
  stepWorld(world, stepMs, fireFrontIntent)

  let closestToCentre = Number.POSITIVE_INFINITY
  let lifeAtDeath = 0
  let steps = 0

  while (world.projectiles.length > 0 && steps < 600) {
    const shot = world.projectiles[0]
    if (shot !== undefined) {
      closestToCentre = Math.min(closestToCentre, Math.hypot(shot.x - target.x, shot.y - target.y))
      lifeAtDeath = shot.lifeMs
    }
    stepWorld(world, stepMs, EMPTY_INTENT)
    steps += 1
  }

  const stepTravel = (bow.projectileSpeed * stepMs) / 1000

  check(
    'a shot never enters an island',
    closestToCentre >= target.radius - stepTravel,
    `closest approach ${closestToCentre.toFixed(1)} px vs island radius ${target.radius}`,
  )
  check(
    'the island killed the shot, not the timer',
    lifeAtDeath > 0,
    `remaining lifetime at death: ${lifeAtDeath.toFixed(0)} ms`,
  )
}

{
  // Acceptance: a shot vanishes at the arena edge.
  const world = createWorld({ config: openWater, seed: 1 })
  world.player.y = 60
  stepWorld(world, stepMs, fireFrontIntent)

  let highest = world.player.y
  let lifeAtDeath = 0
  let steps = 0

  while (world.projectiles.length > 0 && steps < 600) {
    const shot = world.projectiles[0]
    if (shot !== undefined) {
      highest = Math.min(highest, shot.y)
      lifeAtDeath = shot.lifeMs
    }
    stepWorld(world, stepMs, EMPTY_INTENT)
    steps += 1
  }

  const stepTravel = (bow.projectileSpeed * stepMs) / 1000

  check(
    'a shot dies at the arena edge instead of flying off',
    highest >= -stepTravel,
    `furthest north ${highest.toFixed(1)} px`,
  )
  check(
    'the edge killed the shot before its lifetime ran out',
    lifeAtDeath > 0,
    String(lifeAtDeath),
  )
}

{
  // Every removal is reported exactly once: the renderer pools sprites off these events.
  const world = createWorld({ config: openWater, seed: 1 })
  const everyWeaponIntent: ShipIntent = {
    ...EMPTY_INTENT,
    fireFront: true,
    fireLeft: true,
    fireRight: true,
  }

  let reported = 0
  let peakAlive = 0

  for (let step = 0; step < 300; step += 1) {
    stepWorld(world, stepMs, everyWeaponIntent)
    peakAlive = Math.max(peakAlive, world.projectiles.length)
    reported += consumeEvents(world).length
  }

  check(
    'every dead shot is reported exactly once',
    reported === world.shotsFired - world.projectiles.length,
    `${reported} events, ${world.shotsFired} fired, ${world.projectiles.length} alive`,
  )
  check(
    // Bound: per mount, ceil(life / cooldown) volleys x shots per volley → 3 + 6 + 6 = 15.
    'firing all three mounts for five seconds stays bounded',
    peakAlive <= 15,
    `peak ${peakAlive} live shots`,
  )
  check(
    'the three mounts fire independently',
    world.shotsFired > 5 * 4,
    `${world.shotsFired} shots in 5 s`,
  )
}

section('atlas manifest')

{
  // Guards against a stale conversion or a renamed file: the committed atlases must match the
  // manifest the loader uses at runtime (frame counts included).
  for (const key of Object.keys(ATLASES) as AtlasKey[]) {
    const entry = ATLASES[key]
    const urls = entry.retinaJson === undefined ? [entry.json] : [entry.json, entry.retinaJson]

    for (const url of urls) {
      const file = join(process.cwd(), url.replace(/^\/assets\//, 'public/assets/'))
      const label = url.slice(url.lastIndexOf('/') + 1)
      let frames = -1

      try {
        const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
        if (typeof parsed === 'object' && parsed !== null && 'frames' in parsed) {
          frames = Object.keys((parsed as { frames: Record<string, unknown> }).frames).length
        }
      } catch {
        frames = -1
      }

      check(
        `${label} ships ${entry.frames} frames`,
        frames === entry.frames,
        `found ${String(frames)}`,
      )
    }
  }

  let missingSounds = 0
  for (const key of SOUND_KEYS) {
    try {
      readFileSync(join(process.cwd(), 'public/assets/sounds', `${key}.wav`))
    } catch {
      missingSounds += 1
    }
  }

  check(
    'every sound in the manifest exists on disk',
    missingSounds === 0,
    `${missingSounds} missing`,
  )
}

section('enemies, spawn and scoring')

const enemyStepMs = 1000 / 60

/** Runs whole seconds of simulation, so a test reads in match time rather than step counts. */
function runFor(world: World, seconds: number, intent: ShipIntent = EMPTY_INTENT): void {
  const steps = Math.round((seconds * 1000) / enemyStepMs)
  for (let step = 0; step < steps; step += 1) stepWorld(world, enemyStepMs, intent)
}

function gapBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt(distanceSquared(a.x, a.y, b.x, b.y))
}

/**
 * Focused behaviour tests must not race the spawn schedule: a guaranteed Chaser turning up mid-test
 * rams the player for `contactDamage`, which would show up as enemy fire. These tests disable the
 * schedule; the schedule itself is measured separately.
 */
function withoutSpawns(config: Readonly<GameConfig>): Readonly<GameConfig> {
  return { ...config, spawn: { ...config.spawn, intervalMs: 60 * 60 * 1000 } }
}

function islandClearance(world: World, ship: { x: number; y: number; radius: number }): number {
  let worst = Number.POSITIVE_INFINITY
  for (const circle of world.islands) {
    const clearance =
      Math.sqrt(distanceSquared(ship.x, ship.y, circle.x, circle.y)) - circle.radius - ship.radius
    if (clearance < worst) worst = clearance
  }
  return worst
}

{
  // Every berth the scheduler is willing to use must be clear of land and out of the player's lap:
  // the spec calls unfair spawn damage out by name.
  const world = createWorld({ config: testConfig, seed: 7 })
  const spawnSettings = world.config.spawn
  const berths = Array.from({ length: 200 }, () => findBerth(world, 'shooter'))
  const found = berths.filter((berth) => berth !== undefined)

  check('berths are found at all', found.length > 0, `${found.length}/200 attempts`)

  const allFarFromPlayer = found.every(
    (berth) =>
      gapBetween({ x: berth.x, y: berth.y }, world.player) >= spawnSettings.minDistanceFromPlayer,
  )
  check(
    'every berth is at least minDistanceFromPlayer away',
    allFarFromPlayer,
    `threshold ${spawnSettings.minDistanceFromPlayer} px`,
  )

  const allClearOfLand = found.every((berth) => islandClearance(world, { ...berth, radius: 0 }) > 0)
  check('every berth is clear of islands', allClearOfLand)

  const allInsideArena = found.every(
    (berth) =>
      berth.x >= 0 &&
      berth.y >= 0 &&
      berth.x <= world.config.arena.width &&
      berth.y <= world.config.arena.height,
  )
  check('every berth is inside the arena', allInsideArena)
}

{
  // The schedule's guarantee: both types show up in the first two spawns, whatever the dice say.
  const world = createWorld({ config: openWater, seed: 9 })
  const kinds: string[] = []

  for (let spawn = 0; spawn < 2; spawn += 1) {
    runFor(world, world.config.spawn.intervalMs / 1000 + 0.05)
    const newest = world.enemies[world.enemies.length - 1]
    if (newest !== undefined) kinds.push(newest.kind)
  }

  check(
    'the first two spawns are one of each kind',
    kinds.length === 2 && kinds[0] !== kinds[1],
    kinds.join(', ') || 'nothing spawned',
  )
}

{
  // Weighted afterwards. The arena is cleared before every measurement: the schedule stops at
  // maxAlive, and with it stopped the last slot keeps the same enemy, which would be counted again.
  const world = createWorld({ config: openWater, seed: 21 })
  const spawnIntervalSec = world.config.spawn.intervalMs / 1000
  let chasers = 0
  let others = 0
  const scheduled = 60

  for (let spawn = 0; spawn < scheduled; spawn += 1) {
    world.enemies.length = 0
    runFor(world, spawnIntervalSec + 0.05)

    const newest = world.enemies[world.enemies.length - 1]
    // Spawn 0 and 1 are the forced one-of-each pair; the weighted draw starts at spawn 2.
    if (spawn >= 2 && newest !== undefined) {
      if (newest.kind === 'chaser') chasers += 1
      else others += 1
    }
  }

  const chaserShare = chasers + others === 0 ? 0 : chasers / (chasers + others)
  check(
    'the weighted mix favours chasers as configured',
    chaserShare > 0.45 && chaserShare < 0.75,
    `chaser share ${(chaserShare * 100).toFixed(0)} % over ${chasers + others} spawns (weight 60 %)`,
  )
}

{
  // A chaser closes in, aligns on the player, and rams: damage to the player, no point for it.
  const world = createWorld({ config: withoutSpawns(openWater), seed: 3 })
  const chaser = addEnemy(world, 'chaser', 200, 160)
  const startGap = gapBetween(chaser, world.player)
  const hpBefore = world.player.hp

  runFor(world, 0.5)
  check(
    'a chaser closes on the player',
    gapBetween(chaser, world.player) < startGap,
    `${startGap.toFixed(0)} → ${gapBetween(chaser, world.player).toFixed(0)} px`,
  )

  const aimError = Math.abs(angleDelta(chaser.rotation, headingToPoint(chaser, world.player)))
  check('a chaser points at the player', aimError < 0.05, `${aimError.toFixed(3)} rad off`)

  runFor(world, 4)
  check(
    'ramming damages the player by contactDamage',
    world.player.hp === hpBefore - world.config.chaser.contactDamage,
    `hp ${hpBefore} → ${world.player.hp}`,
  )
  check('the chaser dies on contact', !chaser.alive && chaser.killedBy === 'self')
  check('a chaser self-destruct scores nothing', world.score === 0, `score ${world.score}`)
}

{
  // A shooter holds its range, fires on cooldown, and lands exactly one damage per shot.
  const world = createWorld({ config: withoutSpawns(openWater), seed: 4 })
  const shooterConfig = world.config.shooter
  const shooter = addEnemy(world, 'shooter', 120, 360)
  const openingGap = gapBetween(shooter, world.player)

  check('a shooter starts out of range and holds fire', openingGap > shooterConfig.attackRange)
  runFor(world, 0.1)
  check('no enemy shot before the shooter is in range', world.projectiles.length === 0)

  runFor(world, 1.5)
  check('a shooter closes on the player', gapBetween(shooter, world.player) < openingGap)

  runFor(world, 6)
  const heldGap = gapBetween(shooter, world.player)
  check(
    'a shooter holds its preferred range',
    Math.abs(heldGap - shooterConfig.preferredRange) < 40,
    `${heldGap.toFixed(0)} px vs preferred ${shooterConfig.preferredRange} px`,
  )

  const hpBefore = world.player.hp
  // Watch a window longer than the firing interval: at any instant the shooter may be mid-cooldown,
  // so "did it open fire" has to be observed over time rather than sampled once.
  let sawEnemyShot = false
  const watchSteps = Math.round(2000 / enemyStepMs)
  for (let step = 0; step < watchSteps; step += 1) {
    stepWorld(world, enemyStepMs, EMPTY_INTENT)
    if (world.projectiles.some((shot) => shot.owner === 'enemy')) sawEnemyShot = true
  }
  check('a shooter in range opens fire', sawEnemyShot)

  runFor(world, 3)
  const lost = hpBefore - world.player.hp
  const hits = lost / shooterConfig.weapon.damage
  check(
    'each enemy shot takes exactly one weapon worth of health',
    lost > 0 && Number.isInteger(hits),
    `player lost ${lost} hp in ${hits} hit(s) of ${shooterConfig.weapon.damage}`,
  )
  check(
    'the shooter respects its firing interval',
    hits <= Math.ceil(3000 / shooterConfig.weapon.cooldownMs) + 1,
    `${hits} hits in 3 s with a ${shooterConfig.weapon.cooldownMs} ms cooldown`,
  )
}

{
  // Player fire kills an enemy: damage lands once, a destroyed enemy stops existing, and only that
  // kill scores.
  const world = createWorld({ config: withoutSpawns(openWater), seed: 5 })
  const target = addEnemy(world, 'chaser', 640, 100)
  const bow = world.config.player.weapons.front

  stepWorld(world, enemyStepMs, fireFrontIntent)
  runFor(world, 0.5)
  check(
    'a player shot takes exactly one weapon worth of health',
    target.hp === world.config.chaser.maxHp - bow.damage,
    `hp ${target.hp} of ${world.config.chaser.maxHp} (bow ${bow.damage})`,
  )
  check(
    'the shot that hit is gone',
    world.projectiles.length === 0,
    `${world.projectiles.length} left`,
  )

  // Second hit finishes it.
  while (target.alive && world.simTimeMs < 4000) {
    stepWorld(world, enemyStepMs, fireFrontIntent)
  }

  check('a destroyed enemy leaves the world', world.enemies.length === 0)
  check('the kill is credited to the player', target.killedBy === 'player')
  check('a player kill scores one point', world.score === 1, `score ${world.score}`)
}

{
  // "Killed enemies stop firing immediately": after the kill, no new enemy shot appears.
  const world = createWorld({ config: withoutSpawns(openWater), seed: 6 })
  const shooter = addEnemy(world, 'shooter', 640, 120)

  while (world.projectiles.every((shot) => shot.owner !== 'enemy') && world.simTimeMs < 4000) {
    stepWorld(world, enemyStepMs, EMPTY_INTENT)
  }
  check(
    'the shooter fired while it was alive',
    world.projectiles.some((shot) => shot.owner === 'enemy'),
  )

  while (shooter.alive && world.simTimeMs < 8000) {
    stepWorld(world, enemyStepMs, fireFrontIntent)
  }
  check('the shooter can be destroyed', !shooter.alive, `hp ${shooter.hp}`)

  world.projectiles.length = 0
  runFor(world, 3)
  check(
    'a destroyed enemy never fires again',
    world.projectiles.every((shot) => shot.owner !== 'enemy'),
    `${world.projectiles.length} projectile(s) alive`,
  )
}

{
  // Long match: both types turn up, nothing overlaps land, nobody leaves the arena, no NaN.
  const world = createWorld({ config: testConfig, seed: 11 })
  const seen = new Set<string>()
  let worstIslandOverlap = Number.POSITIVE_INFINITY
  let worstNan = false
  let peakAlive = 0

  for (let step = 0; step < 7200; step += 1) {
    stepWorld(world, enemyStepMs, EMPTY_INTENT)

    for (const enemy of world.enemies) {
      seen.add(enemy.kind)
      const clearance = islandClearance(world, enemy)
      if (clearance < worstIslandOverlap) worstIslandOverlap = clearance

      const insideArena =
        enemy.x >= 0 &&
        enemy.y >= 0 &&
        enemy.x <= world.config.arena.width &&
        enemy.y <= world.config.arena.height
      if (!insideArena || Number.isNaN(enemy.x) || Number.isNaN(enemy.y)) worstNan = true
    }

    if (world.enemies.length > peakAlive) peakAlive = world.enemies.length
  }

  check(
    'a two-minute match shows both enemy types',
    seen.has('chaser') && seen.has('shooter'),
    [...seen].join(', '),
  )
  check(
    'enemies never overlap land, even when swerving',
    worstIslandOverlap > -0.5,
    `worst clearance ${worstIslandOverlap.toFixed(2)} px`,
  )
  check('enemies stay inside the arena with finite coordinates', !worstNan)
  check(
    'the schedule keeps the arena populated without piling up',
    peakAlive > 0 && peakAlive <= world.config.spawn.maxAlive,
    `peak ${peakAlive} of ${world.config.spawn.maxAlive}`,
  )
  check('the player never scored with no shots fired', world.score === 0)
}

section('ship art orientation')

{
  // The renderer compensates for the direction the pack draws ships in (see
  // `src/config/shipAppearance.ts`). These assertions read the atlas pixels, so regenerating the
  // sheets cannot silently invalidate those constants — the failure mode would be a ship that sails
  // stern-first, which no type check can catch.
  const sheetPath = join(process.cwd(), 'public/assets/spritesheet/ships_miscellaneous_sheet.json')
  const sheet = JSON.parse(readFileSync(sheetPath, 'utf8')) as SheetJson
  const png = decodePng(
    join(process.cwd(), 'public/assets/spritesheet/ships_miscellaneous_sheet.png'),
  )

  const hullRows = rowWidths(png, frameRect(sheet, 'hull_large_1'))
  const quarter = Math.floor(hullRows.length / 4)
  const topBand = mean(hullRows.slice(0, quarter))
  const bottomBand = mean(hullRows.slice(-quarter))

  check(
    'the hull sprite still tapers to its bow at the bottom of the frame',
    bottomBand < topBand * 0.6,
    `top band ${topBand.toFixed(1)} px wide vs bottom band ${bottomBand.toFixed(1)} px`,
  )
  check(
    'the ship view therefore turns the hull a half turn',
    ART_FACING_OFFSET_RAD === Math.PI,
    `ART_FACING_OFFSET_RAD = ${ART_FACING_OFFSET_RAD}`,
  )

  const cannonColumns = columnHeights(png, frameRect(sheet, 'cannon'))
  const breech = mean(cannonColumns.slice(0, 5))
  const muzzle = mean(cannonColumns.slice(-5))

  check(
    'the cannon sprite still points its muzzle to the right (it narrows)',
    muzzle < breech,
    `breech columns ${breech.toFixed(1)} px vs muzzle columns ${muzzle.toFixed(1)} px`,
  )
  check(
    'the bow gun is therefore turned a quarter turn to lie along the hull',
    BOW_CANNON_ROTATION_RAD === Math.PI / 2,
    `BOW_CANNON_ROTATION_RAD = ${BOW_CANNON_ROTATION_RAD}`,
  )
}

console.log(
  failures === 0 ? '\nSelf-check passed.' : `\nSelf-check failed with ${failures} problem(s).`,
)
if (failures > 0) process.exitCode = 1
