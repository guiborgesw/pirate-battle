/**
 * Player-facing options: bounds, defaults, clamping, stepping and validation.
 *
 * Bounds are documented in README.md and are the only place where the legal range of
 * `durationSec` (60-180 s) and `spawnIntervalMs` (1000-10000 ms, step 500) is defined.
 */

export const OPTION_BOUNDS = {
  durationSec: { min: 60, max: 180, step: 1, unit: 's' },
  spawnIntervalMs: { min: 1000, max: 10000, step: 500, unit: 'ms' },
} as const

export type OptionKey = keyof typeof OPTION_BOUNDS

export type GameOptions = {
  readonly durationSec: number
  readonly spawnIntervalMs: number
}

export type OptionError = {
  readonly field: OptionKey
  readonly message: string
}

export type ParseOptionsResult =
  | { readonly ok: true; readonly options: GameOptions }
  | { readonly ok: false; readonly errors: OptionError[] }

export const DEFAULT_OPTIONS: GameOptions = {
  durationSec: 120,
  spawnIntervalMs: 3000,
}

const OPTION_KEYS: OptionKey[] = ['durationSec', 'spawnIntervalMs']

function describeBounds(key: OptionKey): string {
  const bounds = OPTION_BOUNDS[key]
  return bounds.step === 1
    ? `a whole number between ${bounds.min} and ${bounds.max} ${bounds.unit}`
    : `a multiple of ${bounds.step} between ${bounds.min} and ${bounds.max} ${bounds.unit}`
}

/** Digits-only strings (as produced by number inputs) are accepted alongside real numbers. */
function toFiniteNumber(input: unknown): number | undefined {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : undefined
  }
  if (typeof input === 'string' && input.trim() !== '') {
    const parsed = Number(input)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function validateField(key: OptionKey, input: unknown): OptionError | undefined {
  const bounds = OPTION_BOUNDS[key]
  const value = toFiniteNumber(input)

  if (value === undefined) {
    return { field: key, message: `Enter ${describeBounds(key)}.` }
  }
  if (!Number.isInteger(value)) {
    return { field: key, message: `Enter a whole number of ${bounds.unit}.` }
  }
  if (value < bounds.min || value > bounds.max) {
    return { field: key, message: `Enter ${describeBounds(key)}.` }
  }
  if (value % bounds.step !== 0) {
    return { field: key, message: `Enter ${describeBounds(key)}.` }
  }
  return undefined
}

/** Snaps any finite number into the legal range and onto the configured step. */
export function clampOptionValue(key: OptionKey, input: number): number {
  const bounds = OPTION_BOUNDS[key]
  if (!Number.isFinite(input)) return bounds.min
  const stepped = Math.round(input / bounds.step) * bounds.step
  return Math.min(bounds.max, Math.max(bounds.min, stepped))
}

/** Moves a value one step up or down, stopping at the bounds. */
export function stepOptionValue(key: OptionKey, input: number, direction: 1 | -1): number {
  return clampOptionValue(key, input + direction * OPTION_BOUNDS[key].step)
}

/** Validates an untrusted options object (form input, query string, localStorage). */
export function parseOptions(input: unknown): ParseOptionsResult {
  if (typeof input !== 'object' || input === null) {
    return {
      ok: false,
      errors: OPTION_KEYS.map((field) => ({ field, message: `Enter ${describeBounds(field)}.` })),
    }
  }

  const record = input as Record<string, unknown>
  const errors: OptionError[] = []

  for (const field of OPTION_KEYS) {
    const error = validateField(field, record[field])
    if (error !== undefined) errors.push(error)
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    options: {
      durationSec: clampOptionValue('durationSec', toFiniteNumber(record.durationSec) ?? 0),
      spawnIntervalMs: clampOptionValue(
        'spawnIntervalMs',
        toFiniteNumber(record.spawnIntervalMs) ?? 0,
      ),
    },
  }
}

/**
 * Lenient variant used when reading persisted settings: anything unusable simply yields
 * `undefined` so the caller can fall back to defaults instead of showing an error.
 */
export function parseStoredOptions(input: unknown): GameOptions | undefined {
  const result = parseOptions(input)
  return result.ok ? result.options : undefined
}

/** Formats a value for display: milliseconds options are shown in seconds, as in the mockups. */
export function formatOptionValue(key: OptionKey, value: number): string {
  if (OPTION_BOUNDS[key].unit === 'ms') {
    const seconds = value / 1000
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`
  }
  return `${value} s`
}
