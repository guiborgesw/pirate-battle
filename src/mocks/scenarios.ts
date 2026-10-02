/**
 * Reproducible network scenarios for the mocks (plan §1.10, spec §6).
 *
 * The scenario is chosen with `?scenario=<name>` and remembered in `sessionStorage`, so a reload keeps
 * the demo on the same conditions and a shared link reproduces it exactly. Any randomness (variable
 * latency) comes from the seeded `Rng`, seeded from `?seed=`, so a scenario plays out identically
 * twice.
 */
import { createRng, type Rng } from '../game/core/Rng.ts'

export const SCENARIOS = [
  'success',
  'empty',
  'many-pages',
  'slow',
  'variable-latency',
  'out-of-order',
  'timeout',
  'network-error',
  'http-400',
  'http-500',
  'ranking-fails',
  'history-fails',
  'timeout-after-save',
  'offline-at-end',
] as const

export type Scenario = (typeof SCENARIOS)[number]

export const DEFAULT_SCENARIO: Scenario = 'success'
export const SCENARIO_STORAGE_KEY = 'pb.scenario.v1'
export const DEFAULT_SEED = 1

/** Which endpoint a request belongs to; scenarios can fail one without touching the other. */
export type MockEndpoint = 'ranking' | 'history' | 'save'

export function isScenario(value: string | null | undefined): value is Scenario {
  return value !== null && value !== undefined && (SCENARIOS as readonly string[]).includes(value)
}

export function scenarioFromSearch(search: string): Scenario | undefined {
  const value = new URLSearchParams(search).get('scenario')
  return isScenario(value) ? value : undefined
}

export function seedFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get('seed')
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
  return Number.isInteger(parsed) ? parsed : DEFAULT_SEED
}

let scenario: Scenario = DEFAULT_SCENARIO
let rng: Rng = createRng(DEFAULT_SEED)
let seed = DEFAULT_SEED
const requestCounts = new Map<MockEndpoint, number>()

export function currentScenario(): Scenario {
  return scenario
}

export function setScenario(next: Scenario): void {
  scenario = next
  // A scenario change starts a fresh request ordering: otherwise the `out-of-order` numbering would
  // carry over and the first request of the new demo would already look like a late one.
  requestCounts.clear()
}

/** Picks a scenario at runtime (the dev panel) and remembers it for the next reload. */
export function applyScenario(next: Scenario): void {
  setScenario(next)
  persistScenario(next)
}

export function configureMocks(nextScenario: Scenario, nextSeed: number): void {
  seed = nextSeed
  rng = createRng(nextSeed)
  setScenario(nextScenario)
  persistScenario(nextScenario)
}

function persistScenario(next: Scenario): void {
  try {
    sessionStorage.setItem(SCENARIO_STORAGE_KEY, next)
  } catch {
    // A browser that refuses session storage simply forgets the choice; the URL still carries it.
  }
}

/**
 * The scenario this page runs with: the URL wins (and is remembered), then the last choice, then the
 * default. Called once at boot.
 */
export function resolveScenario(search: string): Scenario {
  const fromUrl = scenarioFromSearch(search)

  if (fromUrl !== undefined) {
    configureMocks(fromUrl, seedFromSearch(search))
    return fromUrl
  }

  let remembered: string | null
  try {
    remembered = sessionStorage.getItem(SCENARIO_STORAGE_KEY)
  } catch {
    remembered = null
  }

  configureMocks(isScenario(remembered) ? remembered : DEFAULT_SCENARIO, seedFromSearch(search))
  return scenario
}

export function resetScenarioState(): void {
  rng = createRng(seed)
  requestCounts.clear()
}

/** How long this request waits before answering, per scenario. */
export function latencyFor(endpoint: MockEndpoint): number {
  switch (scenario) {
    case 'slow':
      return 2000
    case 'variable-latency':
      return 100 + Math.floor(rng.next() * 1400)
    case 'timeout':
      return 6000
    case 'timeout-after-save':
      return endpoint === 'save' ? 6000 : 0
    case 'out-of-order': {
      // The first request is the slowest, so an older response lands after a newer one.
      const count = (requestCounts.get(endpoint) ?? 0) + 1
      requestCounts.set(endpoint, count)
      return Math.max(0, (3 - Math.min(count, 3)) * 600)
    }
    default:
      return 0
  }
}

/** `empty` pretends the server has nothing; `many-pages` fills the board before answering. */
export function scenarioForcesEmpty(): boolean {
  return scenario === 'empty'
}

export function scenarioWantsManyPages(): boolean {
  return scenario === 'many-pages'
}
