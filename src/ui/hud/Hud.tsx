import type { HudSnapshot } from '../../game/GameSession.ts'
import styles from './Hud.module.css'

export type HudProps = {
  readonly snapshot: HudSnapshot
  readonly onExit: () => void
}

/** mm:ss, as in the challenge mockups (01:42). */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function Hud({ snapshot, onExit }: HudProps) {
  const hpPercent = Math.max(0, Math.min(100, snapshot.playerHp))

  return (
    <div className={styles.hud}>
      <div className={styles.group}>
        <img
          className={styles.icon}
          src="/assets/png/ui/hud/icon_heart.png"
          alt="Hull"
          width={24}
          height={24}
        />
        <span className={styles.value}>{snapshot.playerHp}</span>
        <div
          className={styles.hpTrack}
          role="progressbar"
          aria-label="Hull integrity"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hpPercent}
        >
          <div className={styles.hpFill} style={{ width: `${hpPercent}%` }} />
        </div>
      </div>

      <div className={styles.group}>
        <img
          className={styles.icon}
          src="/assets/png/ui/hud/icon_score.png"
          alt="Score"
          width={24}
          height={24}
        />
        <span className={styles.value} data-testid="hud-score">
          {snapshot.score}
        </span>
        <img
          className={styles.icon}
          src="/assets/png/ui/hud/icon_time.png"
          alt="Time left"
          width={24}
          height={24}
        />
        <span className={styles.value} data-testid="hud-time">
          {formatClock(snapshot.remainingSec)}
        </span>
        {/* M13 replaces this region with throttled announcements (score changes, 30 s marks, 10 s). */}
        <p className={styles.srOnly} role="status" aria-live="polite">
          {`Score ${snapshot.score}, ${snapshot.remainingSec} seconds left, ${snapshot.status}.`}
        </p>
      </div>

      <button className={styles.exit} data-testid="exit" type="button" onClick={onExit}>
        Exit
      </button>
    </div>
  )
}
