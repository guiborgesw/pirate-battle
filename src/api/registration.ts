/**
 * Registering a finished match (plan §1.9), with everything it needs passed in so the whole flow can be
 * asserted headlessly: the store, the transport and the clock are dependencies, not imports.
 *
 * The order matters and is the point of the design:
 *
 * 1. the match is written to the pending store **before** the request;
 * 2. the request goes out (`PUT`, idempotent by match id);
 * 3. only a confirmed answer removes it from the store.
 *
 * So an answer that never arrives costs a retry, never a record — and a retry cannot duplicate, because
 * the server keys on the match id.
 */
import { configKeyFor } from '../config/gameConfig.ts'
import type { PutMatchResult } from './client.ts'
import type { MatchRecord, RemoteEndReason } from './contracts.ts'

/** The shape of a finished match as the session reports it, without the wire's dressing. */
export type MatchOutcomeInput = {
  readonly score: number
  readonly playedSec: number
  readonly endReason: RemoteEndReason
}

export type MatchIdentity = {
  readonly playerId: string
  readonly playerName: string
}

export type BuildMatchRecordArgs = {
  readonly outcome: MatchOutcomeInput
  readonly durationSec: number
  readonly spawnIntervalMs: number
  readonly player: MatchIdentity
  readonly matchId: string
  readonly playedAt: string
}

export function buildMatchRecord({
  outcome,
  durationSec,
  spawnIntervalMs,
  player,
  matchId,
  playedAt,
}: BuildMatchRecordArgs): MatchRecord {
  return {
    matchId,
    playerId: player.playerId,
    playerName: player.playerName,
    playedAt,
    score: outcome.score,
    durationMs: outcome.playedSec * 1000,
    endReason: outcome.endReason,
    config: { durationSec, spawnIntervalMs, key: configKeyFor(durationSec, spawnIntervalMs) },
  }
}

export type RegistrationDeps = {
  /** Sends one record; resolves with the stored match or rejects. */
  readonly send: (record: MatchRecord) => Promise<PutMatchResult>
  /** Records waiting to be sent, oldest first. Re-read for every attempt. */
  readonly list: () => readonly MatchRecord[]
  /** Forgets a record that the server confirmed. */
  readonly forget: (matchId: string) => void
}

export type FlushOutcome = {
  readonly saved: readonly MatchRecord[]
  readonly failed: readonly MatchRecord[]
}

/**
 * Sends every waiting match, one at a time. A failure does not stop the queue — the next record may be
 * fine — and nothing is forgotten until the server has answered.
 */
export async function flushPending(deps: RegistrationDeps): Promise<FlushOutcome> {
  const saved: MatchRecord[] = []
  const failed: MatchRecord[] = []

  for (const record of deps.list()) {
    try {
      const stored = await deps.send(record)
      deps.forget(stored.record.matchId)
      saved.push(stored.record)
    } catch {
      failed.push(record)
    }
  }

  return { saved, failed }
}

export type RegistrationStatusInput = {
  readonly isSaving: boolean
  readonly failed: boolean
  readonly hasOutcome: boolean
  readonly savedSomething: boolean
}

/**
 * The four states the result screen announces (plan §1.9), derived rather than guessed: nothing queued
 * means "pending", a request in flight means "saving", and a finished attempt says which way it went.
 */
export function registrationStatusFor({
  isSaving,
  failed,
  hasOutcome,
  savedSomething,
}: RegistrationStatusInput): 'pending' | 'saving' | 'saved' | 'failed' {
  if (isSaving) return 'saving'
  if (failed) return 'failed'
  if (hasOutcome && savedSomething) return 'saved'
  return 'pending'
}
