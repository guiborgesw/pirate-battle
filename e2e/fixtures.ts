/**
 * The shared fixture every spec is written against.
 *
 * It exists so the specs read like the behaviour they describe: `app.play()`, `app.hold('w', 1000)`,
 * `app.advance(30_000)`. Everything it touches is the game's own test surface (`window.__pb`, exposed
 * with `?testHooks=1`), so the rules, collisions and rendering run for real while the clock is under the
 * test's control.
 */
import { test as base, expect, type Page } from '@playwright/test'

export type PlayerState = {
  readonly x: number
  readonly y: number
  readonly rotation: number
  readonly hp: number
}

export type EnemyState = {
  readonly id: number
  readonly kind: 'chaser' | 'shooter'
  readonly x: number
  readonly y: number
  readonly hp: number
}

export type SessionState = {
  readonly status: 'running' | 'paused' | 'ended'
  readonly score: number
  readonly remainingMs: number
  readonly player: PlayerState
  readonly enemies: readonly EnemyState[]
  readonly projectiles: number
}

export type Diagnostics = {
  readonly status: string
  readonly configKey: string
  readonly simTimeMs: number
  readonly frames: number
  readonly manualClock: boolean
  readonly tickerRunning: boolean
  readonly hudListeners: number
  readonly canvasCount: number
  readonly keyboardAttached: boolean
}

export type AudioState = {
  readonly unlocked: boolean
  readonly plays: Readonly<Record<string, number>>
  readonly droppedWhileLocked: number
  readonly droppedWithoutBuffer: number
}

export type PbHooks = {
  getState(): SessionState
  getAudio(): AudioState
  getScore(): number
  getShotsFired(): number
  getRemainingMs(): number
  getHudRenders(): number
  getEffects(kind?: string): number
  getApiCalls(): Readonly<Record<string, number>>
  resetApiCalls(): void
  spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number): number
  setSeed(n: number): void
  useManualClock(): void
  advance(ms: number): void
  stressEnterExit(n: number): void
  /** `undefined` while no session is mounted — which is the truth the arena mount/unmount produces. */
  getDiagnostics(): Diagnostics | undefined
}

// Declaring a global is the one place TypeScript insists on an interface rather than a type alias.
declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    __pb?: PbHooks
  }
}

export type OpenOptions = {
  readonly scenario?: string
  readonly seed?: number
  readonly touch?: boolean
  /** `missing` makes the first asset load fail once, which is what the retry spec needs. */
  readonly assets?: string
  readonly query?: string
}

export class App {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async open({
    scenario,
    seed = 1,
    touch = false,
    assets,
    query,
  }: OpenOptions = {}): Promise<void> {
    const params = new URLSearchParams({ testHooks: '1', seed: String(seed) })
    if (scenario !== undefined) params.set('scenario', scenario)
    if (touch) params.set('touch', '1')
    if (assets !== undefined) params.set('assets', assets)
    await this.page.goto(`/?${params.toString()}${query === undefined ? '' : `&${query}`}`)
  }

  /** Waits for the loading screen to finish and the menu to be interactive. */
  async waitForMenu(): Promise<void> {
    await this.page.waitForSelector('[data-testid="play"]')
  }

  /** Menu → arena, with the clock handed to the test. */
  async play(): Promise<void> {
    await this.page.click('[data-testid="play"]')
    await this.waitForArena()
    await this.useManualClock()
  }

  async waitForArena(): Promise<void> {
    // Two optional chains: `getDiagnostics()` answers `undefined` until a session exists, and asking it
    // for `.status` in the meantime is exactly how the first version of this fixture failed every spec.
    await this.page.waitForFunction(
      () => window.__pb?.getDiagnostics()?.status === 'running',
      undefined,
      {
        timeout: 30_000,
      },
    )
  }

  async useManualClock(): Promise<void> {
    await this.page.evaluate(() => {
      window.__pb?.setSeed(1)
      window.__pb?.useManualClock()
    })
  }

  /** Runs the simulation for real, in fixed steps, without waiting in wall-clock time. */
  async advance(ms: number): Promise<void> {
    await this.page.evaluate((value) => {
      window.__pb?.advance(value)
    }, ms)
  }

  /** Holds a key while the simulation advances, then lets go. */
  async hold(key: string, ms: number): Promise<void> {
    await this.page.keyboard.down(key)
    await this.advance(ms)
    await this.page.keyboard.up(key)
  }

  /**
   * Turns and sails toward a point, in small steps, watching the ship the whole way.
   *
   * The rotation offset is measured, not assumed: a target due north reads `bearing = -π/2` while the
   * ship's rotation there is `0`, so facing a point means `bearing + π/2`. A control loop rather than
   * computed arithmetic also means the test keeps working if the ship is ever retuned.
   */
  async steerTowards(x: number, y: number, budgetMs = 12_000): Promise<void> {
    const step = 100
    for (let spent = 0; spent < budgetMs; spent += step) {
      const { player } = await this.state()
      const bearing = Math.atan2(y - player.y, x - player.x) + Math.PI / 2
      const difference = normaliseAngle(bearing - player.rotation)

      if (Math.abs(difference) > 0.12) {
        await this.page.keyboard.down(difference > 0 ? 'd' : 'a')
        await this.advance(step)
        await this.page.keyboard.up(difference > 0 ? 'd' : 'a')
        continue
      }

      await this.page.keyboard.down('w')
      await this.advance(step)
      await this.page.keyboard.up('w')

      const after = await this.state()
      if (Math.hypot(after.player.x - player.x, after.player.y - player.y) < 0.5) return
    }
  }

  /**
   * Aims at a point and fires once. The aim is re-checked every sixty milliseconds rather than trusted:
   * enemies move, and a ball fired at where one used to be is a ball wasted.
   */
  async fireAt(x: number, y: number): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { player } = await this.state()
      const bearing = Math.atan2(y - player.y, x - player.x) + Math.PI / 2
      const difference = normaliseAngle(bearing - player.rotation)
      if (Math.abs(difference) <= 0.06) break

      await this.page.keyboard.down(difference > 0 ? 'd' : 'a')
      await this.advance(60)
      await this.page.keyboard.up(difference > 0 ? 'd' : 'a')
    }

    await this.page.keyboard.down('Space')
    await this.advance(140)
    await this.page.keyboard.up('Space')
    await this.advance(600)
  }

  state(): Promise<SessionState> {
    return this.page.evaluate(() => {
      const state = window.__pb?.getState()
      if (state === undefined) throw new Error('the game test hooks are not installed')
      return state
    })
  }

  diagnostics(): Promise<Diagnostics> {
    return this.page.evaluate(() => {
      const diagnostics = window.__pb?.getDiagnostics()
      // `undefined` here means no session is mounted (for example on the result screen), which is not
      // the same as the hooks being missing — say which is which.
      if (diagnostics === undefined) throw new Error('no live session is mounted')
      return diagnostics
    })
  }

  shots(): Promise<number> {
    return this.page.evaluate(() => window.__pb?.getShotsFired() ?? -1)
  }

  hudRenders(): Promise<number> {
    return this.page.evaluate(() => window.__pb?.getHudRenders() ?? -1)
  }

  apiCalls(): Promise<Readonly<Record<string, number>>> {
    return this.page.evaluate(() => window.__pb?.getApiCalls() ?? {})
  }

  /** Runs the clock to the end of the session. */
  async finishByTime(): Promise<void> {
    const { remainingMs } = await this.state()
    await this.advance(remainingMs + 1000)
    await this.page.waitForSelector('[data-testid="result-score"]')
  }

  /** Sails the player into a Chaser until the hull gives out. Returns the session's final state. */
  async finishByDeath(): Promise<SessionState> {
    let last = await this.state()

    for (let attempt = 0; attempt < 40; attempt += 1) {
      // The arena unmounts the moment the match ends, so "no longer running" is the signal — the
      // session answers `none` once it is gone, and only briefly `ended` before that.
      if (last.status !== 'running') break

      if (last.enemies.length === 0) {
        await this.page.evaluate(
          ({ x, y }) => {
            window.__pb?.spawnEnemy('chaser', x, y)
          },
          { x: last.player.x + 40, y: last.player.y },
        )
      }

      await this.advance(600)
      last = await this.state()
    }

    await this.page.waitForSelector('[data-testid="result-score"]')
    return last
  }

  async toMenu(): Promise<void> {
    await this.page.click('[data-testid="main-menu"]')
    await this.waitForMenu()
  }

  async openLog(tab: 'ranking' | 'history'): Promise<void> {
    await this.waitForMenu()
    await this.page.click(
      tab === 'ranking' ? '[data-testid="tab-ranking"]' : '[data-testid="tab-history"]',
    )
  }

  /** The number an options stepper is showing, without its unit. */
  async optionValue(key: 'durationSec' | 'spawnIntervalMs'): Promise<number> {
    const text = (await this.page.locator(`[data-testid="option-${key}"]`).textContent()) ?? ''
    return Number.parseInt(text, 10)
  }

  /**
   * Walks an options stepper to a value by clicking it, one step at a time.
   *
   * `target` is the number the stepper *shows*, which is not always the stored unit: the session length
   * is displayed in seconds and so is the spawn interval (`10`, meaning ten seconds).
   *
   * Clicking a stepper sixty times inside one `evaluate` does not work: React batches the updates, every
   * handler reads the same stale value, and the screen ends up barely moved from where it started. This
   * clicks and re-reads — slower, correct, and it throws rather than pretending the target was reached.
   */
  async setOption(key: 'durationSec' | 'spawnIntervalMs', target: number): Promise<void> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const shown = await this.optionValue(key)
      if (shown === target) return
      await this.page.click(`[data-testid="option-${key}-${shown > target ? 'minus' : 'plus'}"]`)
    }
    throw new Error(`the ${key} stepper never reached ${target}`)
  }

  /** The bounding box of an element, or `undefined` when it is not on screen. */
  async box(
    selector: string,
  ): Promise<{ x: number; y: number; width: number; height: number } | undefined> {
    return (await this.page.locator(selector).boundingBox()) ?? undefined
  }
}

export function normaliseAngle(angle: number): number {
  let value = angle
  while (value > Math.PI) value -= 2 * Math.PI
  while (value < -Math.PI) value += 2 * Math.PI
  return value
}

/**
 * The two pieces of stored state the network specs care about, read through one typed place so no spec
 * has to handle `JSON.parse` returning `any`.
 */
export function pendingQueue(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('pb.pending.v1') ?? '{}') as Record<string, unknown>,
  )
}

export function storedRecords(page: Page): Promise<readonly unknown[]> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('pb.mockdb.v1') ?? '[]') as readonly unknown[],
  )
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    await use(new App(page))
  },
})

export { expect }
