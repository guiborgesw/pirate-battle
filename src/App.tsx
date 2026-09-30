import { useEffect, useState } from 'react'

import { createMatchConfig, type GameConfig } from './config/gameConfig.ts'
import { createTestHooks, installTestHooks, testHooksEnabled } from './game/testHooks.ts'
import { loadOptions } from './storage/settings.ts'
import { LoadingScreen } from './ui/screens/LoadingScreen.tsx'
import { GameScreen } from './ui/screens/GameScreen.tsx'
import { useAssetLoading } from './ui/useAssetLoading.ts'
import styles from './App.module.css'

type Screen = 'menu' | 'game'

/**
 * M4 host: loading → menu → arena. The real screen router (options, captain's log, result) and the
 * `sessionStore` arrive in M8/M9; until then this is the smallest thing that lets the arena be
 * mounted and unmounted repeatedly, which is what the milestone checks.
 */
export default function App() {
  const { state, retry } = useAssetLoading()
  const [screen, setScreen] = useState<Screen>('menu')
  const [config, setConfig] = useState<Readonly<GameConfig>>(() => createMatchConfig())

  useEffect(() => {
    if (!testHooksEnabled(window.location.search, import.meta.env.MODE)) return
    installTestHooks(createTestHooks())
  }, [])

  if (state.status !== 'ready') {
    return (
      <LoadingScreen
        progress={state.progress}
        failures={state.status === 'error' ? state.failures : undefined}
        onRetry={state.status === 'error' ? retry : undefined}
      />
    )
  }

  const startMatch = (): void => {
    // Every match reads a snapshot of the options that are current at that moment (spec §3).
    setConfig(createMatchConfig(loadOptions()))
    setScreen('game')
  }

  if (screen === 'game') {
    return (
      <GameScreen
        config={config}
        assets={state.assets}
        seed={1}
        onExit={() => {
          setScreen('menu')
        }}
      />
    )
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="menu-title">
        <h1 className={styles.title} id="menu-title">
          Pirate Battle
        </h1>
        <p className={styles.subtitle}>
          Assets ready — ships {Object.keys(state.assets.atlases.ships.textures).length} · tiles{' '}
          {Object.keys(state.assets.atlases.tiles.textures).length} · ui{' '}
          {Object.keys(state.assets.atlases.ui.textures).length} · sounds{' '}
          {Object.keys(state.assets.sounds).length}
        </p>
        <button className={styles.primary} data-testid="play" type="button" onClick={startMatch}>
          Play
        </button>
        <p className={styles.note}>
          M5: sail with W/A/S/D and steer clear of the islands on the {config.arena.width}×
          {config.arena.height} arena. Add <code>?testHooks=1</code> for the{' '}
          <code>window.__pb</code> hooks.
        </p>
      </section>
    </main>
  )
}
