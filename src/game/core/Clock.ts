/**
 * Simulation clock: the only place that converts frame deltas into fixed simulation steps.
 *
 * It never reads a wall clock. The caller (the Pixi ticker, or the manual test hook) supplies the
 * frame delta, which is why the simulation is deterministic and why `pnpm lint` can forbid
 * `performance.now`/`Date.now` inside `src/game/core`.
 */

export type ClockOptions = {
  /** Length of one simulation step. */
  readonly stepMs: number
  /** A single frame may never advance the simulation by more than this (slow tab, breakpoint). */
  readonly maxFrameMs: number
}

export type AdvanceResult = {
  /** Fixed steps the caller must run for this frame. */
  readonly steps: number
  /** Interpolation factor in [0, 1) for the leftover time inside the current step. */
  readonly alpha: number
  /** Delta actually consumed, after clamping. */
  readonly frameMs: number
  /** True when the incoming delta was clamped. */
  readonly clamped: boolean
}

export type Clock = {
  readonly stepMs: number
  readonly maxFrameMs: number
  simTimeMs(): number
  stepCount(): number
  advance(frameDeltaMs: number): AdvanceResult
  /** How many whole steps fit in `durationMs`, tolerant to floating-point error (see below). */
  stepsFor(durationMs: number): number
  /** Drops the leftover fraction of a step (used when resuming from pause). */
  clearAccumulator(): void
  /** Full reset: new match, sim time back to zero. */
  reset(): void
}

/**
 * `stepMs = 1000 / 60` is not exactly representable in binary floating point: 60 * stepMs is
 * 1000.0000000000001 and 250 / stepMs is 14.999999999999998. Without a tolerance the simulation
 * would silently drop a step (about 0.8 % slow) whenever a frame lands exactly on a step boundary.
 * The tolerance is far below a millisecond, so it can never turn a genuinely partial frame into a
 * step.
 */
const STEP_EPSILON_MS = 1e-9

export function createClock(options: ClockOptions): Clock {
  let accumulatorMs = 0
  let simMs = 0
  let steps = 0

  function stepsFor(durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return 0
    return Math.floor((durationMs + STEP_EPSILON_MS) / options.stepMs)
  }

  return {
    stepMs: options.stepMs,
    maxFrameMs: options.maxFrameMs,

    simTimeMs: () => simMs,
    stepCount: () => steps,
    stepsFor,

    advance(frameDeltaMs: number): AdvanceResult {
      const usableMs = Number.isFinite(frameDeltaMs) && frameDeltaMs > 0 ? frameDeltaMs : 0
      const clamped = usableMs > options.maxFrameMs
      const frameMs = clamped ? options.maxFrameMs : usableMs

      accumulatorMs += frameMs

      const due = stepsFor(accumulatorMs)
      accumulatorMs -= due * options.stepMs
      simMs += due * options.stepMs
      steps += due

      return { steps: due, alpha: accumulatorMs / options.stepMs, frameMs, clamped }
    },

    clearAccumulator(): void {
      accumulatorMs = 0
    },

    reset(): void {
      accumulatorMs = 0
      simMs = 0
      steps = 0
    },
  }
}
