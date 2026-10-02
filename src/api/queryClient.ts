/**
 * The QueryClient for the whole app: the defaults here are the ones from plan §1.8, so individual
 * hooks only declare the deviations (`keepPreviousData`, and refetch-on-mount for the tabs).
 */
import { QueryClient } from '@tanstack/react-query'

export const STALE_TIME_MS = 10_000
export const RETRY_COUNT = 2

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: RETRY_COUNT,
        refetchOnWindowFocus: true,
      },
    },
  })
}
