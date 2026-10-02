import type { EndReason, HudSnapshot } from '../../game/GameSession.ts'
import { PauseDialog } from './PauseDialog.tsx'
import { noteHudRender } from './renderCounter.ts'
import styles from './Hud.module.css'

export type HudProps = {
  readonly snapshot: HudSnapshot
  readonly onExit: () => void
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onRestart: () => void
}

/** mm:ss, as in the challenge mockups (01:42). */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

const END_TEXT: Record<EndReason, string> = {
  time: 'Time is up.',
  death: 'Your hull was sunk.',
}

export function Hud({ snapshot, onExit, onPause, onResume, onRestart }: HudProps) {
  // Counts real renders so the "HUD does not re-render every frame" claim is measurable.
  noteHudRender()

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

        {/* M9 turns this into the styled result screen with registration status; M8 only needs the
            match to stop, the score to be readable and a restart that is a real new session. */}
        {snapshot.status === 'ended' && (
          <section
            className={styles.result}
            data-testid="match-over"
            aria-labelledby="result-title"
          >
            <h2 className={styles.resultTitle} id="result-title">
              Match over
            </h2>
            <p className={styles.resultScore} data-testid="final-score">
              {snapshot.score} {snapshot.score === 1 ? 'point' : 'points'}
            </p>
            <p className={styles.resultReason}>
              {snapshot.endReason === undefined ? '' : END_TEXT[snapshot.endReason]}
            </p>
            <div className={styles.resultActions}>
              <button
                className={styles.primary}
                data-testid="play-again"
                type="button"
                onClick={onRestart}
              >
                Play again
              </button>
              <button className={styles.exit} type="button" onClick={onExit}>
                Main menu
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
