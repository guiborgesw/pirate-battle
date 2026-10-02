/**
 * The pending registrations (plan §1.9): a finished match is written here *before* the request goes
 * out, so a lost answer — a timeout, a closed tab, a dead connection — leaves the match recoverable
 * instead of lost.
 *
 * The map is keyed by match id, which is what makes a retry safe: re-sending the same id cannot create
 * a second record, no matter how many times the request is attempted.
 */
import type { MatchRecord } from '../api/contracts.ts'
import { parseMatchRecord } from '../api/contracts.ts'
import { readJson, removeStored, writeJson } from './localStore.ts'

export type PendingMap = Record<string, MatchRecord>

export function parsePending(input: unknown): PendingMap | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined

  const map: PendingMap = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const record = parseMatchRecord(value)
    // One unreadable entry must not throw away the rest: the others are still registrable.
    if (record === undefined) continue

    // Key and record must agree; a mismatched entry is a corrupt queue, not a match to send.
    if (record.matchId === key) map[key] = record
  }

  return map
}

export function loadPending(): PendingMap {
  const stored = readJson('pending')
  if (!stored.found) return {}

  const parsed = parsePending(stored.value)
  return parsed ?? {}
}

/** Returns whether the record was written, so the caller can say "queued" truthfully. */
export function enqueuePending(record: MatchRecord): boolean {
  const next: PendingMap = { ...loadPending(), [record.matchId]: record }
  return writeJson('pending', next)
}

export function removePending(matchId: string): void {
  const current = loadPending()
  if (!(matchId in current)) return

  const next: PendingMap = {}
  for (const [key, value] of Object.entries(current)) {
    if (key !== matchId) next[key] = value
  }

  if (Object.keys(next).length === 0) removeStored('pending')
  else writeJson('pending', next)
}

export function clearPending(): void {
  removeStored('pending')
}

/** Whether this match is still waiting to be registered. */
export function isPending(matchId: string, map: PendingMap = loadPending()): boolean {
  return matchId in map
}

/** Oldest first: a queue, not a stack, so the first match played is the first one registered. */
export function orderedPending(map: PendingMap = loadPending()): readonly MatchRecord[] {
  return Object.values(map).sort((a, b) => a.playedAt.localeCompare(b.playedAt))
}
