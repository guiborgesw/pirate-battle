import styles from './App.module.css'
import { atlasFrameCount } from './game/assets/loadAssets.ts'
import { LoadingScreen } from './ui/screens/LoadingScreen.tsx'
import { useAssetLoading } from './ui/useAssetLoading.ts'

/**
 * M1-M3 host: loads the challenge assets and reports what is available. The screen router
 * (menu / options / log / game / result) replaces this in M9 and the Pixi canvas arrives in M4.
 */
export default function App() {
  const { state, retry } = useAssetLoading()

  if (state.status === 'loading') {
    return <LoadingScreen progress={state.progress} failures={undefined} onRetry={undefined} />
  }

  if (state.status === 'error') {
    return <LoadingScreen progress={state.progress} failures={state.failures} onRetry={retry} />
  }

  const { atlases, sounds, warnings } = state.assets
  const soundCount = Object.keys(sounds).length

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="placeholder-title">
        <h1 className={styles.title} id="placeholder-title">
          Pirate Battle
        </h1>
        <p className={styles.subtitle}>
          Assets ready — ships {atlasFrameCount(atlases.ships)} · tiles{' '}
          {atlasFrameCount(atlases.tiles)} · ui {atlasFrameCount(atlases.ui)} · sounds {soundCount}
        </p>
        <button className={styles.primary} type="button" disabled>
          Play
        </button>
        <p className={styles.note}>
          {warnings.length === 0
            ? 'No asset warnings. Gameplay arrives with M4–M8.'
            : `${warnings.length} sound warning(s) — the game still runs, sounds fall back to silence.`}
        </p>
      </section>
    </main>
  )
}
