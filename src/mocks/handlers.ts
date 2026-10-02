/**
 * The network layer's mocks (spec §6): contracts, fixtures and handlers shared by development,
 * tests and the published build.
 *
 * Handlers stay thin on purpose — the data rules live in `db.ts` as pure functions, and the scenario
 * behaviour lives in `scenarios.ts`. Here we only translate those into HTTP: delay, fail, or answer.
 */
import { delay, http as mswHttp, HttpResponse } from 'msw'

import { DEFAULT_PAGE_SIZE, parseMatchRecord, type Page } from '../api/contracts.ts'
import { getMockDb } from './db.ts'
import { latencyFor, currentScenario, type MockEndpoint } from './scenarios.ts'

function toInt(raw: string | null, fallback: number): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function problem(status: number, code: string, message: string): Response {
  return HttpResponse.json({ error: { code, message } }, { status })
}

/** A success-shaped but empty page, so the client renders its empty state instead of an error. */
function emptyPage(page: number, pageSize: number): Page<never> {
  return { items: [], page, pageSize, total: 0 }
}

function failureFor(scenario: string, endpoint: MockEndpoint): Response | undefined {
  if (scenario === 'network-error') return HttpResponse.error()
  if (scenario === 'http-400') return problem(400, 'bad_request', 'The request was rejected.')
  if (scenario === 'http-500') return problem(500, 'server_error', 'The service failed.')
  if (scenario === 'ranking-fails' && endpoint === 'ranking') {
    return problem(500, 'ranking_unavailable', 'The ranking service failed.')
  }
  if (scenario === 'history-fails' && endpoint === 'history') {
    return problem(503, 'history_unavailable', 'The history service is unavailable.')
  }
  if (scenario === 'offline-at-end' && endpoint === 'save') {
    // Never reaches the server: this is the "no connection when the match ended" case.
    return HttpResponse.error()
  }

  return undefined
}

async function waitFor(endpoint: MockEndpoint): Promise<void> {
  const latency = latencyFor(endpoint)
  if (latency > 0) await delay(latency)
}

export const handlers = [
  mswHttp.get('/api/ranking', async ({ request }) => {
    const endpoint: MockEndpoint = 'ranking'
    await waitFor(endpoint)

    const failure = failureFor(currentScenario(), endpoint)
    if (failure !== undefined) return failure

    const url = new URL(request.url)
    const configKey = url.searchParams.get('configKey') ?? ''
    const page = toInt(url.searchParams.get('page'), 1)
    const pageSize = toInt(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)
    const db = getMockDb()

    if (currentScenario() === 'empty') return HttpResponse.json(emptyPage(page, pageSize))
    if (currentScenario() === 'many-pages') db.seedMore(configKey, 60)

    return HttpResponse.json(db.ranking(configKey, page, pageSize))
  }),

  mswHttp.get('/api/players/:playerId/matches', async ({ request, params }) => {
    const endpoint: MockEndpoint = 'history'
    await waitFor(endpoint)

    const failure = failureFor(currentScenario(), endpoint)
    if (failure !== undefined) return failure

    const url = new URL(request.url)
    const page = toInt(url.searchParams.get('page'), 1)
    const pageSize = toInt(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)
    const playerId = typeof params.playerId === 'string' ? params.playerId : ''

    if (currentScenario() === 'empty') return HttpResponse.json(emptyPage(page, pageSize))
    return HttpResponse.json(getMockDb().history(playerId, page, pageSize))
  }),

  mswHttp.put('/api/matches/:matchId', async ({ request, params }) => {
    const endpoint: MockEndpoint = 'save'

    // The failure cases that must not touch the data come first: the record simply never arrived.
    const early = failureFor(currentScenario(), endpoint)
    if (early !== undefined) return early

    const body: unknown = await request.json().catch(() => undefined)
    const record = parseMatchRecord(body)
    if (record === undefined) {
      return problem(422, 'invalid_record', 'The match record is not valid.')
    }

    const matchId = typeof params.matchId === 'string' ? params.matchId : ''
    if (matchId !== record.matchId) {
      return problem(409, 'match_id_mismatch', 'The body does not match the match id in the path.')
    }

    await waitFor(endpoint)

    // `timeout-after-save` is the awkward one on purpose: the record IS stored, then the answer takes
    // longer than the client is willing to wait. A retry must find it again instead of duplicating it.
    const result = getMockDb().upsert(record)
    return HttpResponse.json(result.record, { status: result.created ? 201 : 200 })
  }),
]
