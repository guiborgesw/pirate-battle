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
} from '../src/config/gameConfig.ts'
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

console.log(
  failures === 0 ? '\nSelf-check passed.' : `\nSelf-check failed with ${failures} problem(s).`,
)
if (failures > 0) process.exitCode = 1
