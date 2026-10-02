import type { LastMatchResult } from '../../storage/lastResult.ts'
import { GamePanel, PrimaryButton, SecondaryButton, TitleBanner } from '../components/GamePanel.tsx'
import type { LogTab } from '../log/CaptainLogScreen.tsx'
import { endReasonText, formatClock, pointsLabel } from '../format.ts'
import styles from './MenuScreen.module.css'

export type MenuScreenProps = {
  readonly lastResult: LastMatchResult | undefined
  readonly onPlay: () => void
  readonly onOptions: () => void
  readonly onOpenLog: (tab: LogTab) => void
}

const CONTROLS = [
  { icons: ['icon_forward'], label: 'Forward', keys: 'W' },
  { icons: ['icon_turn_left', 'icon_turn_right'], label: 'Turn', keys: 'A / D' },
  { icons: ['icon_fire_front'], label: 'Bow gun', keys: 'Space' },
  { icons: ['icon_fire_left', 'icon_fire_right'], label: 'Broadsides', keys: 'Q / E' },
  { icons: ['icon_pause'], label: 'Pause', keys: 'P / Esc' },
] as const

/**
 * Main menu: Play, Options, the control instructions the spec asks for, and the two tabs that the
 * API milestone (M11/M12) fills in. The last finished match stays visible here after a reload.
 */
export function MenuScreen({ lastResult, onPlay, onOptions, onOpenLog }: MenuScreenProps) {
  return (
    <GamePanel titleId="menu-title">
      <TitleBanner label="Pirate Battle" />
      <h1 className={styles.srOnly} id="menu-title">
        Pirate Battle
      </h1>
      <p className={styles.tagline}>Set sail. Take command.</p>

      <PrimaryButton testId="play" onClick={onPlay}>
        Play
      </PrimaryButton>
      <PrimaryButton testId="options" onClick={onOptions}>
        Options
      </PrimaryButton>

      <ul className={styles.controls} aria-label="Controls">
        {CONTROLS.map((control) => (
          <li className={styles.control} key={control.label}>
            <span className={styles.iconRow}>
              {control.icons.map((icon) => (
                <img
                  className={styles.controlIcon}
                  key={icon}
                  src={`/assets/png/ui/controls/${icon}.png`}
                  alt=""
                  width={32}
                  height={32}
                />
              ))}
            </span>
            <span className={styles.controlLabel}>{control.label}</span>
            <kbd className={styles.controlKeys}>{control.keys}</kbd>
          </li>
        ))}
      </ul>

      <div className={styles.tabs}>
        <SecondaryButton
          testId="tab-ranking"
          onClick={() => {
            onOpenLog('ranking')
          }}
        >
          Ranking
        </SecondaryButton>
        <SecondaryButton
          testId="tab-history"
          onClick={() => {
            onOpenLog('history')
          }}
        >
          Match history
        </SecondaryButton>
      </div>

      <p className={styles.lastResult} data-testid="last-result">
        {lastResult === undefined
          ? 'No finished match yet.'
          : `Last match: ${lastResult.score} ${pointsLabel(lastResult.score)} · ${formatClock(
              lastResult.playedSec,
            )} · ${endReasonText(lastResult.endReason)}`}
      </p>
    </GamePanel>
  )
}
