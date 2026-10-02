/**
 * The wire contracts of the ranking and history APIs (plan §1.8, spec §5).
 *
 * These types deliberately stand alone instead of reusing the session's `MatchOutcome`: they describe
 * what travels over HTTP, and the mocks, the handlers and the screens all share this one definition.
 * A match is registered with the full configuration it was played under, because the ranking only ever
 * compares matches that share it.
 */
import { formatClock } from '../ui/format.ts'

export type RemoteEndReason = 'time' | 'death'

export type MatchConfigRef = {
  readonly durationSec: number
  readonly spawnIntervalMs: number
  /** `d120-s3000`: the ranking filter and the tiebreak group. */
  readonly key: string
}

export type MatchRecord = {
  /** UUID v4 generated at match start; doubles as the idempotency key of the registration. */
  readonly matchId: string
  readonly playerId: string
  readonly playerName: string
  /** ISO timestamp of when the match finished. */
  readonly playedAt: string
  readonly score: number
  /** Effective active time, so a match cut short by death reports what was really played. */
  readonly durationMs: number
  readonly endReason: RemoteEndReason
  readonly config: MatchConfigRef
}

export type Page<T> = {
  readonly items: readonly T[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

export type RankingEntry = MatchRecord & { readonly rank: number }

export const DEFAULT_PAGE_SIZE = 15

/**
 * Order used by the ranking (plan §1.8): score desc, then the shorter match wins, then the earlier
 * one, then the id — a fully deterministic tiebreak, so two equal scores never swap places between
 * requests.
 */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0
}

/** History reads newest first (plan §1.8). */
export function compareHistory(a: MatchRecord, b: MatchRecord): number {
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? 1 : -1
  return a.matchId < b.matchId ? 1 : -1
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const safeSize = Math.max(1, Math.floor(pageSize))
  const safePage = Math.max(1, Math.floor(page))
  const start = (safePage - 1) * safeSize

  return {
    items: items.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    total: items.length,
  }
}

export function totalPages(page: Page<unknown>): number {
  return Math.max(1, Math.ceil(page.total / page.pageSize))
}

/** Duration exactly as the mockups show it: `02:00`, `01:42`. */
export function formatDurationClock(durationMs: number): string {
  return formatClock(Math.max(0, Math.round(durationMs / 1000)))
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** `08 SEP · 21:42`, the format used on both tables in the mockups. */
export function formatPlayedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const day = String(date.getDate()).padStart(2, '0')
  const month = MONTHS[date.getMonth()] ?? ''
  const time = formatClock(date.getHours() * 60 + date.getMinutes())
  return `${day} ${month} · ${time}`
}

/** The word the history table uses; the result screen keeps its own phrasing (M9). */
export function remoteEndReasonText(endReason: RemoteEndReason): string {
  return endReason === 'time' ? 'Time up' : 'Defeated'
}

/**
 * Runtime validation of what comes back over the wire. The mocks are ours, but a ranking that renders
 * `undefined` because a field was renamed is worse than one that says it could not read the response.
 */
export function parseMatchRecord(input: unknown): MatchRecord | undefined {
  if (typeof input !== 'object' || input === null) return undefined

  const record = input as Record<string, unknown>
  const { matchId, playerId, playerName, playedAt, score, durationMs, endReason, config } = record

  if (typeof matchId !== 'string' || matchId.length === 0) return undefined
  if (typeof playerId !== 'string' || playerId.length === 0) return undefined
  if (typeof playerName !== 'string') return undefined
  if (typeof playedAt !== 'string' || Number.isNaN(Date.parse(playedAt))) return undefined
  if (!Number.isInteger(score) || (score as number) < 0) return undefined
  if (!Number.isInteger(durationMs) || (durationMs as number) < 0) return undefined
  if (endReason !== 'time' && endReason !== 'death') return undefined

  const ref = parseConfigRef(config)
  if (ref === undefined) return undefined

  return {
    matchId,
    playerId,
    playerName,
    playedAt,
    score: score as number,
    durationMs: durationMs as number,
    endReason,
    config: ref,
  }
}

export function parseConfigRef(input: unknown): MatchConfigRef | undefined {
  if (typeof input !== 'object' || input === null) return undefined

  const { durationSec, spawnIntervalMs, key } = input as Record<string, unknown>
  if (!Number.isInteger(durationSec) || (durationSec as number) <= 0) return undefined
  if (!Number.isInteger(spawnIntervalMs) || (spawnIntervalMs as number) <= 0) return undefined
  if (typeof key !== 'string' || key.length === 0) return undefined

  return {
    durationSec: durationSec as number,
    spawnIntervalMs: spawnIntervalMs as number,
    key,
  }
}

export function parseRankingEntry(input: unknown): RankingEntry | undefined {
  const record = parseMatchRecord(input)
  if (record === undefined) return undefined

  const rank = (input as Record<string, unknown>).rank
  if (!Number.isInteger(rank) || (rank as number) < 1) return undefined

  return { ...record, rank: rank as number }
}

export function parsePage<T>(
  input: unknown,
  parseItem: (item: unknown) => T | undefined,
): Page<T> | undefined {
  if (typeof input !== 'object' || input === null) return undefined

  const { items, page, pageSize, total } = input as Record<string, unknown>
  if (!Array.isArray(items)) return undefined
  if (!Number.isInteger(page) || (page as number) < 1) return undefined
  if (!Number.isInteger(pageSize) || (pageSize as number) < 1) return undefined
  if (!Number.isInteger(total) || (total as number) < 0) return undefined

  const parsed: T[] = []
  for (const item of items) {
    const value = parseItem(item)
    if (value === undefined) return undefined
    parsed.push(value)
  }

  return {
    items: parsed,
    page: page as number,
    pageSize: pageSize as number,
    total: total as number,
  }
}
