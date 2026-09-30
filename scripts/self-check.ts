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
import { createWorld, stepWorld, type World } from '../src/game/sim/World.ts'
import { hullTierFor, shipAppearance } from '../src/config/shipAppearance.ts'
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

console.log(
  failures === 0 ? '\nSelf-check passed.' : `\nSelf-check failed with ${failures} problem(s).`,
)
if (failures > 0) process.exitCode = 1
