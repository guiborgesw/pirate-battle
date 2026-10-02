import type { LastMatchResult } from '../../storage/lastResult.ts'
import { GamePanel, PrimaryButton, ScreenTitle } from '../components/GamePanel.tsx'
import { endReasonText, formatClock, pointsLabel, registrationText } from '../format.ts'
import styles from './ResultScreen.module.css'

export type ResultScreenProps = {
  readonly result: LastMatchResult
  readonly onPlayAgain: () => void
  readonly onMenu: () => void
}

/** Result screen (spec §3): total score, time played, why it ended, registration status, both actions. */
export function ResultScreen({ result, onPlayAgain, onMenu }: ResultScreenProps) {
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
        {registrationText(result.registration)}
      </p>

      <PrimaryButton testId="play-again" onClick={onPlayAgain}>
        Play again
      </PrimaryButton>
      <PrimaryButton testId="main-menu" onClick={onMenu}>
        Main menu
      </PrimaryButton>
    </GamePanel>
  )
}
