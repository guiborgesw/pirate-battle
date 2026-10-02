/**
 * The one-shot warnings of a match: the low-hull alert and the ten-second warning.
 *
 * Pure on purpose. "Play the warning exactly once per match" is a rule about state, not about sound,
 * so it lives here as a function that can be asserted headlessly instead of being buried in an audio
 * callback. The hysteresis (`REARM_PERCENT`) means a future repair would let the warning fire again
 * rather than leaving a match permanently silent.
 */
import type { SoundKey } from '../assets/manifest.ts'

/** Matches the `damaged` hull tier, so the alarm arrives with the visible damage (spec §2). */
export const LOW_HEALTH_PERCENT = 33
/** Re-arm only after the hull is comfortably back above the alarm. */
export const LOW_HEALTH_REARM_PERCENT = 40
/** The plan's M10: warn when ten seconds are left. */
export const TIME_WARNING_SEC = 10

export type AlertState = {
  readonly lowHealthPlayed: boolean
  readonly timeWarningPlayed: boolean
}

export const INITIAL_ALERTS: AlertState = { lowHealthPlayed: false, timeWarningPlayed: false }

export type AlertInput = {
  readonly hpPercent: number
  readonly remainingSec: number
  readonly running: boolean
}

export type AlertOutcome = {
  readonly sounds: readonly SoundKey[]
  readonly next: AlertState
}

export function resolveAlerts(state: AlertState, input: AlertInput): AlertOutcome {
  const sounds: SoundKey[] = []
  let next = state

  // A finished or paused match never fires a warning: the clock is not moving, and the result screen
  // is what speaks next.
  if (!input.running) return { sounds, next }

  if (state.lowHealthPlayed && input.hpPercent > LOW_HEALTH_REARM_PERCENT) {
    next = { ...next, lowHealthPlayed: false }
  }

  if (!next.lowHealthPlayed && input.hpPercent <= LOW_HEALTH_PERCENT) {
    sounds.push('health_low')
    next = { ...next, lowHealthPlayed: true }
  }

  if (!next.timeWarningPlayed && input.remainingSec <= TIME_WARNING_SEC) {
    sounds.push('time_warning')
    next = { ...next, timeWarningPlayed: true }
  }

  return { sounds, next }
}
