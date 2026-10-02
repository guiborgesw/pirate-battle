/**
 * Test hooks (brief §1.11). They only observe state and drive time; input still goes through real
 * keyboard/pointer events in the Playwright suite.
 *
 * Installed when `import.meta.env.MODE === 'test'` or when the URL carries `?testHooks=1`
 * (which is how the production build is exercised), exposing `window.__pb`.
 */
import type {
  EndReason,
  ProjectileState,
  SessionDiagnostics,
  SessionStatus,
} from './GameSession.ts'
import { liveSessionCount } from './GameSession.ts'
import { getCurrentSession } from './sessionRegistry.ts'
import { hudRenderCount } from '../ui/hud/renderCounter.ts'

export type PbState = {
  readonly status: SessionStatus | 'none'
  readonly score: number
  readonly remainingMs: number
  readonly player: {
    readonly x: number
    readonly y: number
    readonly rotation: number
    readonly hp: number
  }
  readonly enemies: readonly {
    readonly id: number
    readonly kind: string
    readonly x: number
    readonly y: number
    readonly hp: number
  }[]
  readonly projectiles: number
  readonly endReason: EndReason | undefined
}

export type StressResult = {
  readonly before: SessionDiagnostics & { readonly canvases: number; readonly liveSessions: number }
  readonly after: SessionDiagnostics & { readonly canvases: number; readonly liveSessions: number }
  /** Highest values seen while a match was mounted — proves there is exactly one of each. */
  readonly peak: {
    readonly canvases: number
    readonly liveSessions: number
    readonly hudListeners: number
  }
  readonly cycles: number
  readonly errors: readonly string[]
}

export type PbTestHooks = {
  getState(): PbState
  /** Live shots with their velocity, so a test can assert the firing geometry. */
  getProjectiles(): readonly ProjectileState[]
  /** Shots fired since the match started, including the ones already gone. */
  getShotsFired(): number
  /** Exact milliseconds left on the simulation clock (the HUD shows rounded seconds). */
  getRemainingMs(): number
  /** How many times the HUD React component has rendered — the "not every frame" measurement. */
  getHudRenders(): number
  /** Drops an enemy at a fixed spot, so a test can stage a fight without waiting for the schedule. */
  spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number): number
  setSeed(n: number): void
  useManualClock(): void
  advance(ms: number): number
  getDiagnostics(): SessionDiagnostics | undefined
  /** Mounts and unmounts the arena `count` times, then reports listener/canvas counts. */
  stressEnterExit(count: number): Promise<StressResult>
  lastStress(): StressResult | undefined
}

type PbWindow = { __pb?: PbTestHooks }

function viewportDiagnostics(): SessionDiagnostics & {
  readonly canvases: number
  readonly liveSessions: number
} {
  const session = getCurrentSession()

  const base: SessionDiagnostics = session?.getDiagnostics() ?? {
    status: 'ended',
    configKey: 'none',
    simTimeMs: 0,
    steps: 0,
    frames: 0,
    manualClock: false,
    tickerRunning: false,
    hudListeners: 0,
    canvasCount: 0,
    keyboardAttached: false,
    water: { width: 0, height: 0, pixelWidth: 0, pixelHeight: 0 },
    rendererResolution: 0,
    worldScale: 0,
    islands: 0,
    shipViews: 0,
    healthBars: 0,
    projectiles: { created: 0, active: 0, pooled: 0 },
    shotsFired: 0,
  }

  return {
    ...base,
    canvases: document.querySelectorAll('canvas').length,
    liveSessions: liveSessionCount(),
  }
}

function clickTestId(testId: string): boolean {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!(element instanceof HTMLElement)) return false
  element.click()
  return true
}

async function waitForTestId(testId: string, present: boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const exists = document.querySelector(`[data-testid="${testId}"]`) !== null
    if (exists === present) return true
    await new Promise((resolve) => {
      setTimeout(resolve, 16)
    })
  }

  return false
}

export function testHooksEnabled(search: string, mode: string): boolean {
  if (mode === 'test') return true
  return new URLSearchParams(search).get('testHooks') === '1'
}

export function createTestHooks(): PbTestHooks {
  let lastStress: StressResult | undefined

  return {
    getState(): PbState {
      const session = getCurrentSession()
      const snapshot = session?.getSnapshot()
      const player = session?.getPlayerState()

      return {
        status: snapshot?.status ?? 'none',
        score: session?.getScore() ?? snapshot?.score ?? 0,
        remainingMs: session?.getRemainingMs() ?? (snapshot?.remainingSec ?? 0) * 1000,
        player: {
          x: player?.x ?? 0,
          y: player?.y ?? 0,
          rotation: player?.rotation ?? 0,
          hp: player?.hp ?? snapshot?.playerHp ?? 0,
        },
        enemies: session?.getEnemyState() ?? [],
        projectiles: session?.getProjectileState().length ?? 0,
        endReason: snapshot?.endReason,
      }
    },

    getProjectiles(): readonly ProjectileState[] {
      return getCurrentSession()?.getProjectileState() ?? []
    },

    getShotsFired(): number {
      return getCurrentSession()?.getShotsFired() ?? 0
    },

    getRemainingMs(): number {
      return getCurrentSession()?.getRemainingMs() ?? 0
    },

    getHudRenders: hudRenderCount,

    spawnEnemy(kind, x, y): number {
      return getCurrentSession()?.spawnEnemy(kind, x, y) ?? -1
    },

    setSeed(n: number): void {
      getCurrentSession()?.setSeed(n)
    },

    useManualClock(): void {
      getCurrentSession()?.useManualClock()
    },

    advance(ms: number): number {
      return getCurrentSession()?.advance(ms) ?? 0
    },

    getDiagnostics(): SessionDiagnostics | undefined {
      return getCurrentSession()?.getDiagnostics()
    },

    async stressEnterExit(count: number): Promise<StressResult> {
      const before = viewportDiagnostics()
      const errors: string[] = []
      let peakCanvases = 0
      let peakLiveSessions = 0
      let peakHudListeners = 0

      for (let cycle = 0; cycle < count; cycle += 1) {
        if (!clickTestId('play')) errors.push(`cycle ${cycle + 1}: no play button`)
        await waitForTestId('arena', true)

        // Give Pixi the time to initialise and the HUD to subscribe, then sample the mounted state.
        await new Promise((resolve) => {
          setTimeout(resolve, 150)
        })
        const mounted = viewportDiagnostics()
        peakCanvases = Math.max(peakCanvases, mounted.canvases)
        peakLiveSessions = Math.max(peakLiveSessions, mounted.liveSessions)
        peakHudListeners = Math.max(peakHudListeners, mounted.hudListeners)

        if (!clickTestId('exit')) errors.push(`cycle ${cycle + 1}: no exit button`)
        await waitForTestId('arena', false)

        const afterExit = viewportDiagnostics()
        if (afterExit.canvases !== 0 || afterExit.liveSessions !== 0) {
          errors.push(
            `cycle ${cycle + 1}: leak after exit (${afterExit.canvases} canvas, ${afterExit.liveSessions} session)`,
          )
        }
      }

      const after = viewportDiagnostics()
      lastStress = {
        before,
        after,
        peak: {
          canvases: peakCanvases,
          liveSessions: peakLiveSessions,
          hudListeners: peakHudListeners,
        },
        cycles: count,
        errors,
      }
      return lastStress
    },

    lastStress(): StressResult | undefined {
      return lastStress
    },
  }
}

export function installTestHooks(hooks: PbTestHooks): void {
  const target = globalThis as PbWindow
  target.__pb = hooks
}
