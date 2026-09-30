/**
 * Fixed-step loop: every frame it asks the Clock how many simulation steps are due, runs them, and
 * then renders once with the interpolation alpha. Rendering therefore never defines simulation
 * speed — a 144 Hz monitor and a throttled tab run the same systems the same number of times.
 *
 * The frame source is injected (`LoopScheduler`), so this module stays free of browser globals and
 * can be asserted in `pnpm self-check`. In the app the scheduler is Pixi's ticker; in the manual
 * test mode nothing drives it and the Playwright hooks call `advance()`.
 */

import type { Clock } from './Clock.ts'

export type LoopScheduler = {
  start(frame: (frameDeltaMs: number) => void): void
  stop(): void
}

export type FixedStepLoopOptions = {
  readonly clock: Clock
  /** Runs once per fixed step; `stepIndex` is 1-based within the match. */
  readonly onStep: (stepIndex: number, simTimeMs: number) => void
  /** Runs once per frame with the interpolation alpha for the leftover time. */
  readonly onRender: (alpha: number, simTimeMs: number) => void
  readonly scheduler: LoopScheduler
}

export type FixedStepLoop = {
  start(): void
  stop(): void
  isRunning(): boolean
  /** Manual mode: the scheduler is ignored and only `advance()` moves the simulation. */
  setManual(enabled: boolean): void
  isManual(): boolean
  /** Runs the steps due for `ms` (no clamping — this is the deterministic test path). */
  advance(ms: number): number
  /** Discards the next real frame delta (used right after resuming from pause). */
  ignoreNextFrame(): void
  frameCount(): number
}

export function createFixedStepLoop(options: FixedStepLoopOptions): FixedStepLoop {
  const { clock } = options
  let running = false
  let manual = false
  let skipFrame = false
  let frames = 0

  function runSteps(steps: number): void {
    for (let index = 0; index < steps; index += 1) {
      options.onStep(
        clock.stepCount() - steps + index + 1,
        clock.simTimeMs() - (steps - index - 1) * clock.stepMs,
      )
    }
  }

  function frame(frameDeltaMs: number): void {
    frames += 1

    if (skipFrame) {
      skipFrame = false
      return
    }

    const result = clock.advance(frameDeltaMs)
    runSteps(result.steps)
    options.onRender(result.alpha, clock.simTimeMs())
  }

  return {
    start(): void {
      if (running || manual) return
      running = true
      options.scheduler.start(frame)
    },

    stop(): void {
      if (!running) return
      running = false
      options.scheduler.stop()
    },

    isRunning: () => running,
    isManual: () => manual,

    setManual(enabled: boolean): void {
      if (enabled === manual) return
      if (enabled) this.stop()
      manual = enabled
      // Leaving manual mode must not replay the time that was advanced by hand.
      if (!enabled) clock.clearAccumulator()
    },

    advance(ms: number): number {
      if (!manual) {
        throw new Error(
          'advance() requires setManual(true) — call window.__pb.useManualClock() first',
        )
      }

      const steps = clock.stepsFor(ms)

      for (let index = 0; index < steps; index += 1) {
        clock.advance(clock.stepMs)
      }

      runSteps(steps)
      options.onRender(0, clock.simTimeMs())
      return steps
    },

    ignoreNextFrame(): void {
      skipFrame = true
    },

    frameCount: () => frames,
  }
}
