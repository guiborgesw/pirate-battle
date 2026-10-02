/**
 * The registration controller (plan §1.9): flushing the pending queue, plus a status per match for the
 * result screen.
 *
 * The status is **derived from the queue**, not tracked alongside it. A match leaves the queue only once
 * the server has confirmed it (`removePending` is called from the flush, nowhere else), so "still
 * queued" and "registered" are the same question — and a status that cannot drift from the store cannot
 * get stuck either. The first version kept a parallel map of per-match states and did get stuck: the
 * screen sat on "Registering…" while the queue was empty and the record was already on the server.
 *
 * The flush is an explicit async routine rather than a react-query mutation: a mutation object gets a
 * new identity on every render, so a callback depending on it re-arms any effect that uses it — which
 * is how an early version ended up re-sending the same match on every render, forever. Both are
 * recorded in `docs/plan-deviations.md` §I.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import type { MatchRecord } from './contracts.ts'
import { putMatch } from './client.ts'
import { HISTORY_QUERY_ROOT, RANKING_QUERY_ROOT } from './hooks.ts'
import { flushPending } from './registration.ts'
import { markResultRegistered, type MatchRegistration } from '../storage/lastResult.ts'
import { enqueuePending, isPending, orderedPending, removePending } from '../storage/pending.ts'

export type PendingRegistrations = {
  readonly statusOf: (matchId: string | undefined) => MatchRegistration
  readonly submit: (record: MatchRecord) => void
  readonly retry: () => void
}

export function usePendingRegistrations(): PendingRegistrations {
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)
  const [lastFailed, setLastFailed] = useState(false)
  // Bumped whenever the queue changes, so a status derived from it is re-read on the next render.
  const [revision, setRevision] = useState(0)
  const running = useRef(false)

  const retry = useCallback((): void => {
    const waiting = orderedPending()
    // Nothing waiting means the earlier attempt succeeded; re-sending nothing is the correct answer.
    if (waiting.length === 0) return
    // One flush at a time: a second one would send the same records again for no reason.
    if (running.current) return

    running.current = true
    setSending(true)
    setLastFailed(false)

    void (async () => {
      try {
        const outcome = await flushPending({
          send: (record) => putMatch(record),
          list: () => waiting,
          forget: (matchId) => {
            removePending(matchId)
          },
        })

        setLastFailed(outcome.failed.length > 0)

        if (outcome.saved.length > 0) {
          // The menu's "last match" line must not keep claiming a match is unregistered after it landed.
          for (const record of outcome.saved) markResultRegistered(record.matchId)

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: RANKING_QUERY_ROOT }),
            queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_ROOT }),
          ])
        }
      } finally {
        running.current = false
        setSending(false)
        setRevision((previous) => previous + 1)
      }
    })()
  }, [queryClient])

  const submit = useCallback(
    (record: MatchRecord): void => {
      // Written before the request goes out (plan §1.9): a lost answer costs a retry, never a record.
      enqueuePending(record)
      setRevision((previous) => previous + 1)
      retry()
    },
    [retry],
  )

  const statusOf = useCallback(
    (matchId: string | undefined): MatchRegistration => {
      if (matchId === undefined) return 'pending'
      // A request is out: whatever is still in the queue is on its way.
      if (sending) return 'saving'
      if (isPending(matchId)) return lastFailed ? 'failed' : 'pending'
      // No longer queued: the server confirmed it (or it was never queued, which the flow prevents).
      return 'saved'
    },
    // `revision` is not read here on purpose: it forces this callback — and the read of the queue inside
    // it — to be recomputed after every flush.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sending, lastFailed, revision],
  )

  return { statusOf, submit, retry }
}
