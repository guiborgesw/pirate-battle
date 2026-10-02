/**
 * Query hooks for the two tabs (plan §1.8). The options here are the contract:
 *
 * - `keepPreviousData` so paging never flashes an empty table;
 * - `staleTime` 10 s for background refreshes, but `refetchOnMount: 'always'` because the acceptance
 *   says a tab refetches *when it is re-shown* — inside the stale window that would otherwise not
 *   happen;
 * - `retry: 2` for GETs, and the query's `signal` goes to axios so a superseded request is aborted.
 */
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'

import { fetchHistory, fetchRanking } from './client.ts'
import { DEFAULT_PAGE_SIZE, type MatchRecord, type Page, type RankingEntry } from './contracts.ts'

export const STALE_TIME_MS = 10_000
export const RETRY_COUNT = 2

/** Query-key roots. Invalidating a root refetches every page of that resource (plan §1.9). */
export const RANKING_QUERY_ROOT = ['ranking'] as const
export const HISTORY_QUERY_ROOT = ['history'] as const

export const rankingKey = (configKey: string, page: number) =>
  [...RANKING_QUERY_ROOT, configKey, page] as const
export const historyKey = (playerId: string, page: number) =>
  [...HISTORY_QUERY_ROOT, playerId, page] as const

export function useRanking(
  configKey: string,
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
): UseQueryResult<Page<RankingEntry>> {
  return useQuery({
    queryKey: rankingKey(configKey, page),
    queryFn: ({ signal }) => fetchRanking(configKey, page, pageSize, { signal }),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME_MS,
    retry: RETRY_COUNT,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })
}

export function useHistory(
  playerId: string,
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
): UseQueryResult<Page<MatchRecord>> {
  return useQuery({
    queryKey: historyKey(playerId, page),
    queryFn: ({ signal }) => fetchHistory(playerId, page, pageSize, { signal }),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME_MS,
    retry: RETRY_COUNT,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })
}
