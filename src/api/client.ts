/**
 * The single axios instance for the ranking and history APIs (spec §5: "use Axios").
 *
 * Two details that matter beyond the obvious:
 * - the TanStack Query `signal` is forwarded to axios, so a superseded request is actually aborted
 *   instead of merely being ignored when it lands (plan §1.8: late responses must not be shown);
 * - the timeout is short (5 s) because these calls must never hold up the game: a slow ranking is a
 *   ranking that says it failed, not a spinner the player stares at.
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

import {
  parseMatchRecord,
  parsePage,
  parseRankingEntry,
  type MatchRecord,
  type Page,
  type RankingEntry,
} from './contracts.ts'

export const API_BASE = '/api'
export const REQUEST_TIMEOUT_MS = 5000

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

/**
 * How many requests each endpoint has answered. The acceptance "the tabs refetch when they are shown
 * again" is a claim about traffic, so it is measured here (and read through the test hooks) instead of
 * being assumed from the fact that a query hook exists.
 */
let calls: Record<string, number> = {}

http.interceptors.request.use((config) => {
  const key = `${config.method ?? 'get'} ${config.url ?? ''}`
  calls[key] = (calls[key] ?? 0) + 1
  return config
})

export function getApiCalls(): Readonly<Record<string, number>> {
  return { ...calls }
}

export function resetApiCalls(): void {
  calls = {}
}

export type FetchArgs = {
  readonly signal?: AbortSignal
}

/**
 * `exactOptionalPropertyTypes` means an aborted `signal` cannot be handed over as `undefined`, so the
 * key is only added when there is one.
 */
function withSignal<T extends AxiosRequestConfig>(config: T, signal: AbortSignal | undefined): T {
  return signal === undefined ? config : { ...config, signal }
}

/**
 * Turns a transport failure into something worth reading: the API's own message when the body carries
 * one, a timeout or unreachable notice otherwise.
 *
 * A cancelled request is re-thrown untouched: cancellation is how a superseded request is stopped, and
 * dressing it up as a failure would turn "a newer page arrived" into an error message.
 */
function describeError(error: unknown, subject: string, signal: AbortSignal | undefined): Error {
  if (signal?.aborted === true || axios.isCancel(error)) {
    return error instanceof Error ? error : new Error(subject)
  }

  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: unknown } } | undefined
    const message = body?.error?.message
    if (typeof message === 'string' && message.length > 0) return new Error(message)

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new Error(`${subject} took too long to answer.`)
    }
    if (error.response === undefined) return new Error(`${subject} could not be reached.`)

    return new Error(`${subject} failed (${error.response.status}).`)
  }

  return error instanceof Error ? error : new Error(`${subject} failed.`)
}

export async function fetchRanking(
  configKey: string,
  page: number,
  pageSize: number,
  { signal }: FetchArgs = {},
): Promise<Page<RankingEntry>> {
  const response = await http
    .get('/ranking', withSignal({ params: { configKey, page, pageSize } }, signal))
    .catch((error: unknown) => {
      throw describeError(error, 'The ranking', signal)
    })

  const parsed = parsePage(response.data, parseRankingEntry)
  if (parsed === undefined) throw new Error('The ranking response could not be read.')
  return parsed
}

export async function fetchHistory(
  playerId: string,
  page: number,
  pageSize: number,
  { signal }: FetchArgs = {},
): Promise<Page<MatchRecord>> {
  const response = await http
    .get(`/players/${playerId}/matches`, withSignal({ params: { page, pageSize } }, signal))
    .catch((error: unknown) => {
      throw describeError(error, 'The match history', signal)
    })

  const parsed = parsePage(response.data, parseMatchRecord)
  if (parsed === undefined) throw new Error('The match history response could not be read.')
  return parsed
}

export type PutMatchResult = {
  readonly record: MatchRecord
  readonly created: boolean
}

/** `201` when the match is new, `200` when this exact registration already happened (plan §1.8). */
export async function putMatch(
  record: MatchRecord,
  { signal }: FetchArgs = {},
): Promise<PutMatchResult> {
  const response = await http
    .put(`/matches/${record.matchId}`, record, withSignal({}, signal))
    .catch((error: unknown) => {
      throw describeError(error, 'The registration', signal)
    })

  const parsed = parseMatchRecord(response.data)
  if (parsed === undefined) throw new Error('The registration response could not be read.')

  return { record: parsed, created: response.status === 201 }
}
