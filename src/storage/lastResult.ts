/**
 * The last *finished* match, persisted so a reload still shows it (spec §3: persist locally the
 * player's options and the result of the last completed match).
 *
 * Only completed matches land here. A match abandoned by reloading the page or leaving the arena is
 * never written, which is what "an abandoned match is not recorded" (spec §3) means in practice: the
 * write happens in the same breath as the match ending, and nothing writes on the way out.
 */
import { readJson, removeStored, writeJson } from './localStore.ts'

/** The four states the result screen announces (plan §1.9). */
export const MATCH_REGISTRATIONS = ['pending', 'saving', 'saved', 'failed'] as const
export type MatchRegistration = (typeof MATCH_REGISTRATIONS)[number]

export const MATCH_END_REASONS = ['time', 'death'] as const
export type MatchEndReason = (typeof MATCH_END_REASONS)[number]

export type LastMatchResult = {
  /** Which match this was, so a registration can be matched back to the result it belongs to. */
  readonly matchId: string
  readonly score: number
  /** Seconds actually played, so a match cut short by death reports its real length. */
  readonly playedSec: number
  /** Session length this match was configured with. */
  readonly durationSec: number
  readonly endReason: MatchEndReason
  /** Where this match stands with the ranking API — the API layer (M11/M12) fills this in. */
  readonly registration: MatchRegistration
  readonly finishedAt: string
  readonly configKey: string
}

export function parseLastResult(input: unknown): LastMatchResult | undefined {
  if (typeof input !== 'object' || input === null) return undefined

  const record = input as Record<string, unknown>
  const { matchId, score, playedSec, durationSec, endReason, registration, finishedAt, configKey } =
    record

  if (typeof matchId !== 'string' || matchId.length < 8) return undefined
  if (!isWholeNumber(score) || score < 0) return undefined
  if (!isWholeNumber(playedSec) || playedSec < 0) return undefined
  if (!isWholeNumber(durationSec) || durationSec <= 0) return undefined
  // A match cannot have been played for longer than the session it was played in.
  if (playedSec > durationSec) return undefined
  if (typeof endReason !== 'string' || !isEndReason(endReason)) return undefined
  if (typeof registration !== 'string' || !isRegistration(registration)) return undefined
  if (typeof finishedAt !== 'string' || Number.isNaN(Date.parse(finishedAt))) return undefined
  if (typeof configKey !== 'string' || configKey.length === 0) return undefined

  return {
    matchId,
    score,
    playedSec,
    durationSec,
    endReason,
    registration,
    finishedAt,
    configKey,
  }
}

/**
 * Marks the stored result as registered once the API confirms it (plan §1.9), so the menu's "last match"
 * line does not keep claiming a match is unregistered after it landed. Matched by id: a flush of older
 * matches must not rewrite the status of a newer result.
 */
export function markResultRegistered(matchId: string): void {
  const current = loadLastResult()
  if (current?.matchId !== matchId) return
  if (current.registration === 'saved') return

  saveLastResult({ ...current, registration: 'saved' })
}

export function loadLastResult(): LastMatchResult | undefined {
  const stored = readJson('lastResult')
  return stored.found ? parseLastResult(stored.value) : undefined
}

export function saveLastResult(result: LastMatchResult): boolean {
  return writeJson('lastResult', result)
}

export function clearLastResult(): void {
  removeStored('lastResult')
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

function isEndReason(value: string): value is MatchEndReason {
  return (MATCH_END_REASONS as readonly string[]).includes(value)
}

function isRegistration(value: string): value is MatchRegistration {
  return (MATCH_REGISTRATIONS as readonly string[]).includes(value)
}
