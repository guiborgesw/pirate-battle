/**
 * Text formatting shared by the HUD and the menu screens, kept out of the components so it can be
 * asserted headlessly in `pnpm self-check`.
 */
import type { MatchEndReason, MatchRegistration } from '../storage/lastResult.ts'

/** mm:ss, as in the challenge mockups (01:42). */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function pointsLabel(score: number): string {
  return score === 1 ? 'point' : 'points'
}

export function endReasonText(reason: MatchEndReason): string {
  return reason === 'time' ? 'Time up' : 'Hull sunk'
}

export function registrationText(registration: MatchRegistration): string {
  if (registration === 'registered') return 'Registered in the ranking'
  if (registration === 'offline') return 'Saved offline — will sync later'
  return 'Not registered yet'
}
