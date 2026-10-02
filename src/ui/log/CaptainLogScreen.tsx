import { useMemo, useState, type ReactNode } from 'react'

import { configKeyFor, configLabelFor } from '../../config/gameConfig.ts'
import { loadOptions } from '../../storage/settings.ts'
import { getPlayer } from '../../storage/player.ts'
import { PrimaryButton } from '../components/GamePanel.tsx'
import styles from './CaptainLog.module.css'
import { HistoryTable } from './HistoryTable.tsx'
import { RankingTable } from './RankingTable.tsx'

export type LogTab = 'ranking' | 'history'

export type CaptainLogScreenProps = {
  readonly initialTab: LogTab
  readonly onBack: () => void
}

/**
 * The Captain's log (challenge mockups `sample_ranking.png` / `sample_history.png`): one board with
 * two tabs, the ranking filtered by the configuration currently in force and the player's own history.
 *
 * The configuration is read from the options at mount, so changing the session length in Options and
 * coming back here shows the board for the configuration the next match would use.
 *
 * Switching tabs remounts the table, and entering the board from the menu mounts it fresh, which is
 * what makes "the tabs refetch when they are shown again" true rather than hoped for.
 */
export function CaptainLogScreen({ initialTab, onBack }: CaptainLogScreenProps): ReactNode {
  const [tab, setTab] = useState<LogTab>(initialTab)
  const player = getPlayer()
  const options = useMemo(() => loadOptions(), [])
  const key = configKeyFor(options.durationSec, options.spawnIntervalMs)

  return (
    <main className={styles.shell}>
      <section className={styles.board} aria-labelledby="log-title">
        <h1 className={styles.title} id="log-title">
          Captain&rsquo;s log
        </h1>

        <div className={styles.tabs} role="tablist" aria-label="Captain's log sections">
          <button
            className={tab === 'ranking' ? styles.tabActive : styles.tab}
            type="button"
            role="tab"
            id="log-tab-ranking"
            aria-selected={tab === 'ranking'}
            aria-controls="log-panel"
            data-testid="tab-ranking"
            onClick={() => {
              setTab('ranking')
            }}
          >
            Ranking
          </button>
          <button
            className={tab === 'history' ? styles.tabActive : styles.tab}
            type="button"
            role="tab"
            id="log-tab-history"
            aria-selected={tab === 'history'}
            aria-controls="log-panel"
            data-testid="tab-history"
            onClick={() => {
              setTab('history')
            }}
          >
            Match history
          </button>
        </div>

        <p className={styles.subtitle} data-testid="log-subtitle">
          {tab === 'ranking'
            ? configLabelFor(options.durationSec, options.spawnIntervalMs)
            : `${player.playerName} · your recent battles`}
        </p>

        <div
          className={styles.content}
          role="tabpanel"
          id="log-panel"
          aria-labelledby={tab === 'ranking' ? 'log-tab-ranking' : 'log-tab-history'}
        >
          {tab === 'ranking' ? (
            <RankingTable configKey={key} playerId={player.playerId} />
          ) : (
            <HistoryTable playerId={player.playerId} />
          )}
        </div>

        <PrimaryButton testId="log-back" onClick={onBack}>
          Main menu
        </PrimaryButton>
      </section>
    </main>
  )
}
