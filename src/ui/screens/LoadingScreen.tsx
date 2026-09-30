import type { AssetFailure, AssetProgress } from '../../game/assets/loadAssets.ts'
import styles from './LoadingScreen.module.css'

type LoadingScreenProps = {
  readonly progress: AssetProgress
  readonly failures: readonly AssetFailure[] | undefined
  readonly onRetry: (() => void) | undefined
}

const PHASE_LABEL: Record<AssetProgress['phase'], string> = {
  textures: 'Loading textures',
  audio: 'Loading sounds',
}

export function LoadingScreen({ progress, failures, onRetry }: LoadingScreenProps) {
  const total = Math.max(progress.total, 1)
  const percent = Math.min(100, Math.round((progress.loaded / total) * 100))
  const hasFailed = failures !== undefined && failures.length > 0

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="loading-title">
        <h1 className={styles.title} id="loading-title">
          Pirate Battle
        </h1>

        {hasFailed ? (
          <div className={styles.error} role="alert">
            <h2 className={styles.errorTitle}>Could not load the game assets</h2>
            <ul className={styles.errorList}>
              {failures.map((failure) => (
                <li key={failure.key}>
                  <code>{failure.key}</code> — {failure.reason}
                </li>
              ))}
            </ul>
            <button className={styles.primary} type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <div
              className={styles.bar}
              role="progressbar"
              aria-label="Loading game assets"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
            <p className={styles.status} role="status" aria-live="polite">
              {PHASE_LABEL[progress.phase]} — {progress.loaded} / {progress.total} ({percent}%)
            </p>
          </>
        )}
      </section>
    </main>
  )
}
