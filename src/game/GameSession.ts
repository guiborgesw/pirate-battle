/**
 * GameSession is the only object React talks to: it owns the Pixi renderer, the fixed-step loop, the
 * simulation world and the input devices. React reads a `HudSnapshot` through
 * `useSyncExternalStore`, so the HUD can never re-render per frame by accident.
 *
 * Lifecycle: `GameSession.create()` → `start()` → (`pause()` / `resume()`)* → `destroy()`. Everything
 * that was created — canvas, ticker listener, keyboard listeners, ResizeObserver, views — is
 * released by `destroy()`, which is what lets the arena be mounted and unmounted repeatedly.
 */
import type { Ticker } from 'pixi.js'
import { Container } from 'pixi.js'

import { configKey, type GameConfig } from '../config/gameConfig.ts'
import { WATER_TILE } from '../config/tileMap.ts'
import type { LoadedAssets } from './assets/loadAssets.ts'
import { createClock, type Clock } from './core/Clock.ts'
import {
  createFixedStepLoop,
  type FixedStepLoop,
  type LoopScheduler,
} from './core/FixedStepLoop.ts'
import { createInputState, type InputState } from './input/InputState.ts'
import { createKeyboardInput, type KeyboardInput } from './input/KeyboardInput.ts'
import { createRenderer, type Renderer } from './render/Renderer.ts'
import { createArenaBackground } from './render/views/ArenaBackground.ts'
import { createIslandView, type IslandView } from './render/views/IslandView.ts'
import { createHealthBarView, type HealthBarView } from './render/views/HealthBarView.ts'
import {
  createProjectileViews,
  type ProjectileViews,
  type ProjectileViewStats,
} from './render/views/ProjectileView.ts'
import { createShipView, type ShipView } from './render/views/ShipView.ts'
import type { EnemyShip, Ship } from './sim/entities.ts'
import { addEnemy } from './sim/systems/spawn.ts'
import { consumeEvents, createWorld, stepWorld, type World } from './sim/World.ts'

/** Cannonball frame in the ships sheet (10x10, so a logical radius of 5). */
export const CANNON_BALL_FRAME = 'cannon_ball'

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
  readonly maxHp: number
  readonly alive: boolean
  readonly killedBy: 'player' | 'self' | undefined
}

export type ProjectileState = {
  readonly id: number
  readonly owner: string
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly lifeMs: number
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
  readonly keyboardAttached: boolean
  /** Water texture geometry: `width` is logical, `pixelWidth` is the real sheet pixels. */
  readonly water: {
    readonly width: number
    readonly height: number
    readonly pixelWidth: number
    readonly pixelHeight: number
  }
  readonly rendererResolution: number
  readonly worldScale: number
  readonly islands: number
  readonly shipViews: number
  readonly healthBars: number
  readonly projectiles: ProjectileViewStats
  readonly shotsFired: number
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
  private readonly assets: LoadedAssets
  private readonly renderer: Renderer
  private readonly clock: Clock
  private readonly loop: FixedStepLoop
  private readonly world: World
  private readonly input: InputState
  private readonly keyboard: KeyboardInput
  private readonly listeners = new Set<() => void>()
  private readonly background: ReturnType<typeof createArenaBackground>
  private readonly islandViews: IslandView[] = []
  private readonly shipViews = new Map<number, ShipView>()
  private readonly healthBars = new Map<number, HealthBarView>()
  private readonly shipLayer = new Container()
  private readonly projectileLayer = new Container()
  private readonly projectileViews: ProjectileViews
  /** Bars sit above every other world object and never rotate with the hull. */
  private readonly healthBarLayer = new Container()

  private status: SessionStatus = 'running'
  private pauseReason: PauseReason | undefined
  private seed: number
  private destroyed = false
  private snapshot: HudSnapshot

  private constructor(options: GameSessionOptions, renderer: Renderer) {
    this.config = options.config
    this.assets = options.assets
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

    for (const island of this.config.islands) {
      const view = createIslandView({ island, tiles: options.assets.atlases.tiles })
      this.islandViews.push(view)
      renderer.world.addChild(view.container)
    }

    renderer.world.addChild(this.shipLayer)

    const cannonBall = options.assets.atlases.ships.textures[CANNON_BALL_FRAME]
    if (cannonBall === undefined) {
      renderer.destroy()
      throw new Error(
        `the ships atlas has no "${CANNON_BALL_FRAME}" frame — was assets:convert run?`,
      )
    }

    renderer.world.addChild(this.projectileLayer)
    renderer.world.addChild(this.healthBarLayer)
    this.projectileViews = createProjectileViews({
      texture: cannonBall,
      layer: this.projectileLayer,
    })

    this.world = createWorld({ config: this.config, seed: options.seed })
    this.input = createInputState()
    this.keyboard = createKeyboardInput({
      state: this.input,
      onPause: () => {
        this.togglePause()
      },
    })

    this.clock = createClock({ stepMs: STEP_MS, maxFrameMs: MAX_FRAME_MS })
    this.loop = createFixedStepLoop({
      clock: this.clock,
      scheduler: tickerScheduler(renderer.app),
      onStep: () => {
        stepWorld(this.world, STEP_MS, this.input)
      },
      onRender: (alpha) => {
        this.renderWorld(alpha)
        this.publish()
      },
    })

    this.ensureShipViews()
    this.snapshot = this.computeSnapshot()
    liveSessions += 1
  }

  start(): void {
    if (this.destroyed) return
    this.status = 'running'
    this.pauseReason = undefined
    this.keyboard.attach()
    this.loop.start()
    this.publish()
  }

  pause(reason: PauseReason = 'user'): void {
    if (this.destroyed || this.status !== 'running') return
    this.status = 'paused'
    this.pauseReason = reason
    // Gameplay keys stop being captured as soon as the match is no longer active (spec §7).
    this.keyboard.detach()
    this.loop.stop()
    this.publish()
  }

  resume(): void {
    if (this.destroyed || this.status !== 'paused') return
    this.status = 'running'
    this.pauseReason = undefined
    // Resuming must not replay the paused wall-clock time: clear the inputs, drop the partial
    // accumulator and ignore the first (huge) frame delta.
    this.input.clear()
    this.clock.clearAccumulator()
    this.loop.ignoreNextFrame()
    this.keyboard.attach()
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
    this.keyboard.detach()
    this.listeners.clear()

    for (const view of this.shipViews.values()) view.destroy()
    this.shipViews.clear()

    for (const view of this.islandViews) view.destroy()
    this.islandViews.length = 0

    for (const view of this.healthBars.values()) view.destroy()
    this.healthBars.clear()

    this.projectileViews.destroy()
    this.projectileLayer.destroy({ children: true })
    this.healthBarLayer.destroy({ children: true })
    this.shipLayer.destroy({ children: true })
    this.background.destroy()
    this.renderer.destroy()
    liveSessions -= 1
  }

  getPlayerState(): PlayerState {
    const player = this.world.player
    return { x: player.x, y: player.y, rotation: player.rotation, hp: player.hp }
  }

  /** Live shots, for the browser test hooks and the cooldown checks. */
  getProjectileState(): readonly ProjectileState[] {
    return this.world.projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      lifeMs: projectile.lifeMs,
    }))
  }

  /** Shots fired since the match started, counting the ones that already died. */
  getShotsFired(): number {
    return this.world.shotsFired
  }

  getScore(): number {
    return this.world.score
  }

  /** Live enemies with their health, for the browser test hooks. */
  getEnemyState(): readonly EnemyState[] {
    return this.world.enemies.map((enemy) => ({
      id: enemy.id,
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      alive: enemy.alive,
      killedBy: enemy.killedBy,
    }))
  }

  /** Drops an enemy at a fixed spot, so a test can stage a fight deterministically. */
  spawnEnemy(kind: EnemyShip['kind'], x: number, y: number): number {
    return addEnemy(this.world, kind, x, y).id
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
      keyboardAttached: this.keyboard.isAttached(),
      water: {
        width: this.background.texture.width,
        height: this.background.texture.height,
        pixelWidth: source.pixelWidth,
        pixelHeight: source.pixelHeight,
      },
      rendererResolution: this.renderer.app.renderer.resolution,
      worldScale: this.renderer.scaleFactor(),
      islands: this.islandViews.length,
      shipViews: this.shipViews.size,
      healthBars: this.healthBars.size,
      projectiles: this.projectileViews.stats(),
      shotsFired: this.world.shotsFired,
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

  /** Drive the input state directly; used by tests that cannot dispatch real key events. */
  getInput(): InputState {
    return this.input
  }

  private ensureShipViews(): void {
    const parts = this.assets.atlases.ships
    const ships: Ship[] = [this.world.player, ...this.world.enemies]

    for (const ship of ships) {
      if (this.shipViews.has(ship.id)) continue
      const view = createShipView({ parts, ship })
      this.shipViews.set(ship.id, view)
      this.shipLayer.addChild(view.container)
    }
  }

  private renderWorld(alpha: number): void {
    this.ensureShipViews()
    this.ensureHealthBars()

    for (const ship of [this.world.player, ...this.world.enemies]) {
      this.shipViews.get(ship.id)?.sync(ship, alpha)
      this.healthBars.get(ship.id)?.sync(ship, alpha)
    }

    this.projectileViews.sync(this.world, alpha)

    // Views are released from the simulation's own removal events, so a shot that died mid-step
    // always frees its sprite — even when this one frame ran several fixed steps.
    const events = consumeEvents(this.world)
    if (events.length === 0) return

    const removedProjectiles: number[] = []
    for (const event of events) {
      if (event.entity === 'projectile') removedProjectiles.push(event.id)
      if (event.entity === 'enemy') this.releaseEnemyViews(event.id)
    }
    this.projectileViews.release(removedProjectiles)
  }

  /** An enemy's bar and hull go away together, in the frame the simulation removed it. */
  private releaseEnemyViews(id: number): void {
    this.healthBars.get(id)?.destroy()
    this.healthBars.delete(id)

    this.shipViews.get(id)?.destroy()
    this.shipViews.delete(id)
  }

  private ensureHealthBars(): void {
    const parts = this.assets.atlases.ui

    for (const ship of [this.world.player, ...this.world.enemies]) {
      if (this.healthBars.has(ship.id)) continue

      const view = createHealthBarView({ parts, ship })
      this.healthBars.set(ship.id, view)
      this.healthBarLayer.addChild(view.container)
    }
  }

  private computeSnapshot(): HudSnapshot {
    const durationMs = this.config.match.durationSec * 1000
    const remainingSec = Math.max(0, Math.ceil((durationMs - this.clock.simTimeMs()) / 1000))

    return {
      status: this.status,
      score: this.world.score,
      remainingSec,
      playerHp: this.world.player.hp,
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
