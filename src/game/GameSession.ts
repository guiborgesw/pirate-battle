/**
 * GameSession is the only object React talks to: it owns the Pixi renderer and the fixed-step loop.
 * React reads a `HudSnapshot` through `useSyncExternalStore`, so the HUD can never re-render per
 * frame by accident.
 *
 * Lifecycle: `GameSession.create()` → `start()` → (`pause()` / `resume()`)* → `destroy()`. Everything
 * that was created — canvas, ticker listener, ResizeObserver — is released by `destroy()`, which is
 * what lets the arena be mounted and unmounted repeatedly.
 */
import type { Ticker } from 'pixi.js'

import { configKey, type GameConfig } from '../config/gameConfig.ts'
import { WATER_TILE } from '../config/tileMap.ts'
import type { LoadedAssets } from './assets/loadAssets.ts'
import { createClock, type Clock } from './core/Clock.ts'
import {
  createFixedStepLoop,
  type FixedStepLoop,
  type LoopScheduler,
} from './core/FixedStepLoop.ts'
import { createRenderer, type Renderer } from './render/Renderer.ts'
import { createArenaBackground } from './render/views/ArenaBackground.ts'

/** One simulation step: 60 Hz. */
export const STEP_MS = 1000 / 60
/** A single frame may never advance the simulation by more than this. */
export const MAX_FRAME_MS = 250

export type EndReason = 'time' | 'death'
export type SessionStatus = 'running' | 'paused' | 'ended'
export type PauseReason = 'user' | 'blur' | 'hidden' | 'auto'

export type HudSnapshot = {
  readonly status: SessionStatus
  readonly score: number
  readonly remainingSec: number
  readonly playerHp: number
  readonly endReason: EndReason | undefined
}

export type SessionDiagnostics = {
  readonly status: SessionStatus
  readonly configKey: string
  readonly simTimeMs: number
  readonly steps: number
  readonly frames: number
  readonly manualClock: boolean
  readonly tickerRunning: boolean
  readonly hudListeners: number
  readonly canvasCount: number
  /** Water texture geometry: `width` is logical, `pixelWidth` is the real sheet pixels. */
  readonly water: {
    readonly width: number
    readonly height: number
    readonly pixelWidth: number
    readonly pixelHeight: number
  }
  readonly rendererResolution: number
  readonly worldScale: number
}

export type GameSessionOptions = {
  readonly host: HTMLElement
  readonly config: Readonly<GameConfig>
  readonly seed: number
  readonly assets: LoadedAssets
}

/** Number of sessions that were created and not destroyed yet — used by the lifecycle checks. */
let liveSessions = 0

export function liveSessionCount(): number {
  return liveSessions
}

function tickerScheduler(app: { ticker: Ticker }): LoopScheduler {
  let handler: ((ticker: Ticker) => void) | undefined

  return {
    start(frame: (deltaMs: number) => void): void {
      handler = (ticker) => {
        frame(ticker.deltaMS)
      }
      app.ticker.add(handler)
    },
    stop(): void {
      if (handler === undefined) return
      app.ticker.remove(handler)
      handler = undefined
    },
  }
}

export class GameSession {
  static async create(options: GameSessionOptions): Promise<GameSession> {
    const renderer = await createRenderer({ host: options.host, size: options.config.arena })
    return new GameSession(options, renderer)
  }

  private readonly config: Readonly<GameConfig>
  private readonly renderer: Renderer
  private readonly clock: Clock
  private readonly loop: FixedStepLoop
  private readonly listeners = new Set<() => void>()
  private readonly background: ReturnType<typeof createArenaBackground>

  private status: SessionStatus = 'running'
  private pauseReason: PauseReason | undefined
  private seed: number
  private destroyed = false
  private snapshot: HudSnapshot

  private constructor(options: GameSessionOptions, renderer: Renderer) {
    this.config = options.config
    this.seed = options.seed
    this.renderer = renderer

    const waterTexture = options.assets.atlases.tiles.textures[WATER_TILE]
    if (waterTexture === undefined) {
      renderer.destroy()
      throw new Error(`the tiles atlas has no "${WATER_TILE}" frame — was assets:convert run?`)
    }

    this.background = createArenaBackground({
      waterTexture,
      width: this.config.arena.width,
      height: this.config.arena.height,
    })
    renderer.world.addChild(this.background)

    this.clock = createClock({ stepMs: STEP_MS, maxFrameMs: MAX_FRAME_MS })
    this.loop = createFixedStepLoop({
      clock: this.clock,
      scheduler: tickerScheduler(renderer.app),
      // M5 attaches the world and runs the systems here.
      onStep: () => undefined,
      onRender: () => {
        this.publish()
      },
    })

    this.snapshot = this.computeSnapshot()
    liveSessions += 1
  }

  start(): void {
    if (this.destroyed) return
    this.status = 'running'
    this.pauseReason = undefined
    this.loop.start()
    this.publish()
  }

  pause(reason: PauseReason = 'user'): void {
    if (this.destroyed || this.status !== 'running') return
    this.status = 'paused'
    this.pauseReason = reason
    this.loop.stop()
    this.publish()
  }

  resume(): void {
    if (this.destroyed || this.status !== 'paused') return
    this.status = 'running'
    this.pauseReason = undefined
    // Resuming must not replay the paused wall-clock time: drop the partial accumulator and ignore
    // the first (huge) frame delta.
    this.clock.clearAccumulator()
    this.loop.ignoreNextFrame()
    this.loop.start()
    this.publish()
  }

  togglePause(): void {
    if (this.status === 'running') this.pause('user')
    else if (this.status === 'paused') this.resume()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): HudSnapshot {
    return this.snapshot
  }

  /** Stops everything and releases the canvas; cached textures stay in Pixi's Assets cache. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.status = 'ended'
    this.loop.stop()
    this.listeners.clear()
    this.background.destroy()
    this.renderer.destroy()
    liveSessions -= 1
  }

  getDiagnostics(): SessionDiagnostics {
    const source = this.background.texture.source

    return {
      status: this.status,
      configKey: configKey(this.config),
      simTimeMs: this.clock.simTimeMs(),
      steps: this.clock.stepCount(),
      frames: this.loop.frameCount(),
      manualClock: this.loop.isManual(),
      tickerRunning: this.renderer.app.ticker.started,
      hudListeners: this.listeners.size,
      canvasCount: document.querySelectorAll('canvas').length,
      water: {
        width: this.background.texture.width,
        height: this.background.texture.height,
        pixelWidth: source.pixelWidth,
        pixelHeight: source.pixelHeight,
      },
      rendererResolution: this.renderer.app.renderer.resolution,
      worldScale: this.renderer.scaleFactor(),
    }
  }

  /** Test seam (M4 acceptance: the loop must be drivable without real time). */
  useManualClock(): void {
    this.loop.setManual(true)
  }

  advance(ms: number): number {
    this.loop.setManual(true)
    const steps = this.loop.advance(ms)
    this.publish()
    return steps
  }

  setSeed(seed: number): void {
    this.seed = seed
  }

  getSeed(): number {
    return this.seed
  }

  isManualClock(): boolean {
    return this.loop.isManual()
  }

  getPauseReason(): PauseReason | undefined {
    return this.pauseReason
  }

  private computeSnapshot(): HudSnapshot {
    const durationMs = this.config.match.durationSec * 1000
    const remainingSec = Math.max(0, Math.ceil((durationMs - this.clock.simTimeMs()) / 1000))

    return {
      status: this.status,
      score: 0,
      remainingSec,
      playerHp: this.config.player.maxHp,
      endReason: undefined,
    }
  }

  /** Emits a new snapshot object only when a visible field actually changed. */
  private publish(): void {
    const next = this.computeSnapshot()
    const previous = this.snapshot

    const changed =
      next.status !== previous.status ||
      next.score !== previous.score ||
      next.remainingSec !== previous.remainingSec ||
      next.playerHp !== previous.playerHp ||
      next.endReason !== previous.endReason

    if (!changed) return

    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}
