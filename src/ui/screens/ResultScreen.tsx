import type { MatchRegistration } from '../../storage/lastResult.ts'
import type { LastMatchResult } from '../../storage/lastResult.ts'
import { GamePanel, PrimaryButton, ScreenTitle, SecondaryButton } from '../components/GamePanel.tsx'
import { endReasonText, formatClock, pointsLabel, registrationText } from '../format.ts'
import styles from './ResultScreen.module.css'

export type ResultScreenProps = {
  readonly result: LastMatchResult
  /** Live registration state for *this* match (plan §1.9), not the one written when it ended. */
  readonly registration: MatchRegistration
  readonly onRetry: () => void
  readonly onPlayAgain: () => void
  readonly onMenu: () => void
}

/**
 * Result screen (spec §3): total score, time played, why it ended, registration status, both actions.
 *
 * The retry only appears when the registration actually failed: while a match is queued or on its way
 * there is nothing for the player to do, and a button that re-sends nothing is worse than no button.
 */
export function ResultScreen({
  result,
  registration,
  onRetry,
  onPlayAgain,
  onMenu,
}: ResultScreenProps) {
  return (
    <GamePanel titleId="result-title">
      <ScreenTitle id="result-title">Battle complete</ScreenTitle>

      <p className={styles.score} data-testid="result-score">
        {result.score}
      </p>
      <p className={styles.meta} data-testid="result-meta">
        {pointsLabel(result.score).toUpperCase()} · {formatClock(result.playedSec)} ·{' '}
        {endReasonText(result.endReason).toUpperCase()}
      </p>
      <p className={styles.registration} data-testid="result-registration">
        {registrationText(registration)}
      </p>

      {registration === 'failed' && (
        <SecondaryButton testId="retry-registration" onClick={onRetry}>
          Try registering again
        </SecondaryButton>
      )}

      <PrimaryButton testId="play-again" onClick={onPlayAgain}>
        Play again
      </PrimaryButton>
      <PrimaryButton testId="main-menu" onClick={onMenu}>
        Main menu
      </PrimaryButton>
    </GamePanel>
  )
}
