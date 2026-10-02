/**
 * The player's identity: a UUID generated on first launch and kept in localStorage (plan §1.8), plus
 * the name that travels with a registered match.
 *
 * Losing this id would orphan a player's history, so it is written once and never regenerated: if the
 * store is unreadable the id is recreated, but a readable one always wins.
 */
import { newId } from './ids.ts'
import { readJson, writeJson } from './localStore.ts'

export type PlayerIdentity = {
  readonly playerId: string
  readonly playerName: string
}

const NAME_PREFIX = 'Captain'

export function defaultPlayerName(playerId: string): string {
  return `${NAME_PREFIX} ${playerId.slice(0, 4).toUpperCase()}`
}

export function parseIdentity(input: unknown): PlayerIdentity | undefined {
  if (typeof input !== 'object' || input === null) return undefined

  const { playerId, playerName } = input as Record<string, unknown>
  if (typeof playerId !== 'string' || playerId.length < 8) return undefined
  if (typeof playerName !== 'string' || playerName.length === 0) return undefined

  return { playerId, playerName }
}

let cached: PlayerIdentity | undefined

/** Reads the stored identity, creating and persisting one the first time. */
export function getPlayer(): PlayerIdentity {
  if (cached !== undefined) return cached

  const stored = readJson('playerId')
  const parsed = stored.found ? parseIdentity(stored.value) : undefined
  if (parsed !== undefined) {
    cached = parsed
    return cached
  }

  const playerId = newId()
  const identity: PlayerIdentity = { playerId, playerName: defaultPlayerName(playerId) }
  writeJson('playerId', identity)
  cached = identity
  return identity
}

export function setPlayerName(playerName: string): boolean {
  const trimmed = playerName.trim()
  if (trimmed.length === 0) return false

  const next: PlayerIdentity = { ...getPlayer(), playerName: trimmed.slice(0, 24) }
  cached = next
  return writeJson('playerId', next)
}

/** Test seam: forget the cached identity so the next call re-reads storage. */
export function resetPlayerCache(): void {
  cached = undefined
}
