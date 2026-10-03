import type { HudSnapshot } from '../../game/GameSession.ts'
import { TIME_WARNING_SEC } from '../../game/audio/alerts.ts'
import { formatClock } from '../format.ts'
import { announcementFor } from './announce.ts'
import { PauseDialog } from './PauseDialog.tsx'
import { noteHudRender } from './renderCounter.ts'
import styles from './Hud.module.css'

export type HudProps = {
  readonly snapshot: HudSnapshot
  readonly onExit: () => void
  readonly onPause: () => void
  readonly onResume: () => void
}

/**
 * In-match HUD: hull, score, time, and the pause control.
 *
 * The end of a match leaves this screen entirely (the result screen replaces the arena), so the only
 * overlay here is the pause dialog.
 */
export function Hud({ snapshot, onExit, onPause, onResume }: HudProps) {
  // Counts real renders so the "HUD does not re-render every frame" claim is measurable.
  noteHudRender()

  const hpPercent = Math.max(0, Math.min(100, snapshot.playerHp))

  return (
    <div className={styles.hud}>
      {/* Score, time and match state in words as well as pixels (spec §7). The text only changes when a
          thirty-second bucket is crossed, the score moves, or the match pauses — so a polite live region
          has nothing to announce between those moments, which is the "avoid announcing every frame" rule
          holding by construction rather than by discipline. */}
      <p className={styles.srOnly} role="status" aria-live="polite" data-testid="hud-announcement">
        {announcementFor({
          score: snapshot.score,
          remainingSec: snapshot.remainingSec,
          paused: snapshot.status === 'paused',
        })}
      </p>
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
        <span
          // The same constant that fires the ten-second warning also lights the timer, so the sound
          // and the highlight can never disagree about when the end is close.
          className={snapshot.remainingSec <= TIME_WARNING_SEC ? styles.timeLow : styles.value}
          data-testid="hud-time"
        >
          {formatClock(snapshot.remainingSec)}
        </span>
      </div>

      <div className={styles.controls}>
        {snapshot.status === 'running' && (
          <button className={styles.exit} data-testid="pause" type="button" onClick={onPause}>
            Pause
          </button>
        )}
        <button className={styles.exit} data-testid="exit" type="button" onClick={onExit}>
          Exit
        </button>
      </div>

      {/*
        Overlays live in their own full-viewport layer. The HUD bar itself is a thin strip at the top
        of the arena, so anchoring a dialog to it would centre the dialog on that strip and clip it.
      */}
      <div className={styles.overlay}>
        {snapshot.status === 'paused' && (
          <PauseDialog reason={snapshot.pauseReason} onResume={onResume} />
        )}
      </div>
    </div>
  )
}
