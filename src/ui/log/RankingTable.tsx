import { useState, type ReactNode } from 'react'

import { formatPlayedAt, totalPages, type Page, type RankingEntry } from '../../api/contracts.ts'
import { useRanking } from '../../api/hooks.ts'
import { RoundButton } from '../components/GamePanel.tsx'
import styles from './LogTable.module.css'
import { QueryState } from './QueryState.tsx'

export type RankingTableProps = {
  readonly configKey: string
  readonly playerId: string
}

/** The ranking of one configuration: score desc, then the deterministic tiebreak from the contract. */
export function RankingTable({ configKey, playerId }: RankingTableProps): ReactNode {
  const [page, setPage] = useState(1)
  const query = useRanking(configKey, page)
  const data = query.data

  return (
    <QueryState
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      error={query.error}
      isEmpty={(data?.items.length ?? 0) === 0}
      // An empty page that is not the first one means the board got shorter underneath us (a scenario
      // change, a reset). Saying so beats claiming there are no matches at all, and Prev is one click.
      emptyText={
        page > 1
          ? 'This page is empty now — the board is shorter than it was.'
          : 'No matches have been played under this configuration yet.'
      }
      onRetry={() => {
        void query.refetch()
      }}
    >
      <table className={styles.table} data-testid="ranking-table">
        <caption>{`Ranking for configuration ${configKey}`}</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Captain</th>
            <th scope="col">Points</th>
            <th scope="col">Played</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((entry) => (
            <RankingRow entry={entry} playerId={playerId} key={entry.matchId} />
          ))}
        </tbody>
      </table>

      <Pager page={data?.page ?? 1} total={data ?? undefined} onPage={setPage} />
    </QueryState>
  )
}

function RankingRow({
  entry,
  playerId,
}: {
  readonly entry: RankingEntry
  readonly playerId: string
}) {
  const own = entry.playerId === playerId

  return (
    <tr className={own ? styles.ownRow : styles.row} data-testid="ranking-row">
      <td className={styles.rank}>{String(entry.rank).padStart(2, '0')}</td>
      <td className={styles.captain}>
        {entry.rank === 1 && (
          <img className={styles.star} src="/assets/png/ui/hud/icon_score.png" alt="First place" />
        )}
        {entry.playerName}
        {own && <span className={styles.you}>You</span>}
      </td>
      <td className={styles.points}>{entry.score}</td>
      <td className={styles.played}>{formatPlayedAt(entry.playedAt)}</td>
    </tr>
  )
}

/** Shared by both tables: two round buttons around `Page X of Y` (see the challenge mockups). */
export function Pager({
  page,
  total,
  onPage,
}: {
  readonly page: number
  readonly total: Page<unknown> | undefined
  readonly onPage: (page: number) => void
}) {
  const pages = total === undefined ? 1 : totalPages(total)

  return (
    <div className={styles.pager}>
      <RoundButton
        icon="icon_turn_left"
        label="Previous page"
        testId="page-prev"
        disabled={page <= 1}
        onClick={() => {
          onPage(Math.max(1, page - 1))
        }}
      />
      <span className={styles.pageLabel} data-testid="page-label">
        {`Page ${page} of ${pages}`}
      </span>
      <RoundButton
        icon="icon_turn_right"
        label="Next page"
        testId="page-next"
        disabled={page >= pages}
        onClick={() => {
          onPage(page + 1)
        }}
      />
    </div>
  )
}
