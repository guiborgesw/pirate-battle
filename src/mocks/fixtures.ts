/**
 * The other players of the ranking (spec §5: "outros jogadores são representados por fixtures").
 *
 * Generated from a seeded RNG so the same 40 records appear every time, and spread over three
 * configurations because the ranking only ever compares matches that share one. The busiest
 * configuration is the default one, so a fresh install opens the tab on a populated board rather than
 * on the empty state.
 */
import { configKeyFor } from '../config/gameConfig.ts'
import { createRng } from '../game/core/Rng.ts'
import type { MatchConfigRef, MatchRecord, RemoteEndReason } from '../api/contracts.ts'

/** Fixed point in time so fixtures are byte-identical between runs (and between Node and the browser). */
const FIXTURE_EPOCH_MS = Date.parse('2026-09-15T18:00:00.000Z')

export const FIXTURE_CONFIGS: readonly MatchConfigRef[] = [
  { durationSec: 120, spawnIntervalMs: 3000, key: configKeyFor(120, 3000) },
  { durationSec: 60, spawnIntervalMs: 2000, key: configKeyFor(60, 2000) },
  { durationSec: 180, spawnIntervalMs: 10000, key: configKeyFor(180, 10000) },
] as const

/** How the 40 records are spread: the default configuration gets enough for two pages. */
const CONFIG_COUNTS: readonly number[] = [18, 14, 8]

export const FIXTURE_PLAYERS: readonly string[] = [
  'Blackbeard',
  'Anne Bonny',
  'Calico Jack',
  'Mary Read',
  'Henry Morgan',
  'Ching Shih',
  'Grace O Malley',
  'Jean Lafitte',
  'Zheng Yi Sao',
  'Bartholomew Roberts',
  'Rachel Wall',
  'Samuel Bellamy',
] as const

export function fixturePlayerId(name: string): string {
  const slug = name.toLowerCase().replaceAll(' ', '-')
  return `fixture-${slug}`
}

function fixtureMatchId(index: number): string {
  return `f1000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

export function buildFixtureRecords(): MatchRecord[] {
  // Same seed as the mock database's own randomness, so a demo is reproducible from `?seed=`.
  const rng = createRng(1)
  const records: MatchRecord[] = []
  let index = 0

  FIXTURE_CONFIGS.forEach((config, configIndex) => {
    const count = CONFIG_COUNTS[configIndex] ?? 0

    for (let i = 0; i < count; i += 1) {
      // A match is either played out (`time`) or cut short by a sinking (`death`).
      const endReason: RemoteEndReason = rng.next() < 0.65 ? 'time' : 'death'
      const durationMs =
        endReason === 'time'
          ? config.durationSec * 1000
          : Math.round(config.durationSec * 1000 * (0.35 + rng.next() * 0.5))

      const player = FIXTURE_PLAYERS[index % FIXTURE_PLAYERS.length] ?? 'Unknown'
      const playedAt = new Date(FIXTURE_EPOCH_MS - index * 7.5 * 60 * 60 * 1000).toISOString()

      records.push({
        matchId: fixtureMatchId(index),
        playerId: fixturePlayerId(player),
        playerName: player,
        playedAt,
        // Better players are the ones with more encounters behind them; the score follows suit.
        score: 4 + Math.floor(rng.next() * 38),
        durationMs,
        endReason,
        config,
      })

      index += 1
    }
  })

  return records
}
