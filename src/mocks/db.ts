/**
 * The mock database behind both APIs (plan §1.10).
 *
 * There is deliberately **one** collection of match records: the ranking is a filtered, sorted view of
 * it and the history is a filtered view by player. That is what makes the spec's "a completed match
 * produces exactly one history record and one ranking entry, with consistent state between the two
 * tabs" true by construction instead of by careful bookkeeping — an idempotent upsert of a match id
 * cannot create a second entry anywhere.
 *
 * It lives in `localStorage` (`pb.mockdb.v1`) so confirmed records survive a refresh, and it hydrates
 * from the fixtures the first time. Reads go through the same pure query functions the self-check
 * exercises.
 */
import {
  compareHistory,
  compareRanking,
  paginate,
  parseMatchRecord,
  type Page,
  type MatchRecord,
  type RankingEntry,
} from '../api/contracts.ts'
import { readJson, writeJson } from '../storage/localStore.ts'
import { buildFixtureRecords } from './fixtures.ts'

export type UpsertResult = {
  readonly created: boolean
  readonly record: MatchRecord
}

export type MockDb = {
  readonly all: () => readonly MatchRecord[]
  readonly ranking: (configKey: string, page: number, pageSize: number) => Page<RankingEntry>
  readonly history: (playerId: string, page: number, pageSize: number) => Page<MatchRecord>
  readonly upsert: (record: MatchRecord) => UpsertResult
  /** Adds records for the `many-pages` scenario; idempotent per config key. */
  readonly seedMore: (configKey: string, count: number) => number
  readonly reset: () => void
}

/** Pure: the ranking of one configuration, ranked in position order. */
export function queryRanking(
  records: readonly MatchRecord[],
  configKey: string,
  page: number,
  pageSize: number,
): Page<RankingEntry> {
  const matching = records.filter((record) => record.config.key === configKey).sort(compareRanking)
  const entries = matching.map((record, index) => ({ ...record, rank: index + 1 }))

  return paginate(entries, page, pageSize)
}

/** Pure: one player's matches, newest first. */
export function queryHistory(
  records: readonly MatchRecord[],
  playerId: string,
  page: number,
  pageSize: number,
): Page<MatchRecord> {
  const matching = records.filter((record) => record.playerId === playerId).sort(compareHistory)
  return paginate(matching, page, pageSize)
}

/** Pure: idempotent registration. The same match id never produces a second record. */
export function upsertMatch(records: MatchRecord[], record: MatchRecord): UpsertResult {
  const index = records.findIndex((existing) => existing.matchId === record.matchId)
  if (index === -1) {
    records.push(record)
    return { created: true, record }
  }

  const existing = records[index]
  if (existing === undefined) return { created: true, record }
  return { created: false, record: existing }
}

function parseStoredRecords(input: unknown): MatchRecord[] | undefined {
  if (!Array.isArray(input)) return undefined

  const records: MatchRecord[] = []
  for (const item of input) {
    const record = parseMatchRecord(item)
    if (record === undefined) return undefined
    records.push(record)
  }

  return records
}

/** Prefix of the rows the `many-pages` scenario adds, so seeding can be recognised and done once. */
const SEEDED_MARKER = 'f2000000-'

let records: MatchRecord[] | undefined

function load(): MatchRecord[] {
  if (records !== undefined) return records

  const stored = readJson('mockDb')
  const parsed = stored.found ? parseStoredRecords(stored.value) : undefined
  records = parsed ?? buildFixtureRecords()
  return records
}

function persist(): void {
  writeJson('mockDb', load())
}

export function getMockDb(): MockDb {
  return {
    all: () => load(),
    ranking: (configKey, page, pageSize) => queryRanking(load(), configKey, page, pageSize),
    history: (playerId, page, pageSize) => queryHistory(load(), playerId, page, pageSize),
    upsert: (record) => {
      const result = upsertMatch(load(), record)
      persist()
      return result
    },
    seedMore: (configKey, count) => {
      const all = load()
      const template = all.find((record) => record.config.key === configKey)
      if (template === undefined) return 0

      // Idempotent: seeding twice must not double the board. `many-pages` asks for a bigger dataset on
      // every request it serves, and a handler that kept adding rows would grow the ranking forever.
      const marker = SEEDED_MARKER
      if (
        all.some((record) => record.config.key === configKey && record.matchId.startsWith(marker))
      ) {
        return 0
      }

      // Generated from the records already there, so the extra pages look like the real thing.
      for (let i = 0; i < count; i += 1) {
        const index = all.length
        upsertMatch(all, {
          ...template,
          matchId: `${marker}0000-4000-8000-${String(index).padStart(12, '0')}`,
          playerName: `Rival ${(index % 9) + 1}`,
          playerId: `fixture-rival-${(index % 9) + 1}`,
          score: 3 + ((index * 7) % 40),
          playedAt: new Date(Date.parse(template.playedAt) - index * 3600 * 1000).toISOString(),
        })
      }

      persist()
      return count
    },
    reset: () => {
      records = buildFixtureRecords()
      persist()
    },
  }
}

/** Test seam: drop the in-memory copy so the next read re-hydrates from storage. */
export function resetMockDbCache(): void {
  records = undefined
}
