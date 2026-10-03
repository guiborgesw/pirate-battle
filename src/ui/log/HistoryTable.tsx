import { useState, type ReactNode } from 'react'

import { formatDurationClock, formatPlayedAt, remoteEndReasonText } from '../../api/contracts.ts'
import { useHistory } from '../../api/hooks.ts'
import { QueryState } from './QueryState.tsx'
import { Pager } from './RankingTable.tsx'
import styles from './LogTable.module.css'

export type HistoryTableProps = {
  readonly playerId: string
}

/** The player's own matches, newest first. */
export function HistoryTable({ playerId }: HistoryTableProps): ReactNode {
  const [page, setPage] = useState(1)
  const query = useHistory(playerId, page)
  const data = query.data
  const items = data?.items ?? []

  return (
    <QueryState
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      error={query.error}
      isEmpty={items.length === 0}
      emptyText={
        page > 1
          ? 'This page is empty now — go back a page.'
          : 'You have not finished a match yet. Play one and it will show up here.'
      }
      onRetry={() => {
        void query.refetch()
      }}
    >
      <table className={styles.table} data-testid="history-table">
        <caption>Your recent battles</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.played}>
              Date
            </th>
            <th scope="col">Points</th>
            <th scope="col">Duration</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((record, index) => (
            // The newest match gets the same highlight the mockup gives it.
            <tr
              className={index === 0 && page === 1 ? styles.leadRow : styles.row}
              data-testid="history-row"
              key={record.matchId}
            >
              <td className={styles.played}>{formatPlayedAt(record.playedAt)}</td>
              <td className={styles.points}>{record.score}</td>
              <td className={styles.duration}>{formatDurationClock(record.durationMs)}</td>
              <td className={styles.result}>{remoteEndReasonText(record.endReason)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pager page={data?.page ?? 1} total={data} onPage={setPage} />
    </QueryState>
  )
}
