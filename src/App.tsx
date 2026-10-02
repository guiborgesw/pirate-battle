import { useCallback, useEffect, useState } from 'react'

import { configKey, createMatchConfig, type GameConfig } from './config/gameConfig.ts'
import type { MatchOutcome } from './game/GameSession.ts'
import { createTestHooks, installTestHooks, testHooksEnabled } from './game/testHooks.ts'
import { loadLastResult, saveLastResult, type LastMatchResult } from './storage/lastResult.ts'
import { loadOptions } from './storage/settings.ts'
import { GameScreen } from './ui/screens/GameScreen.tsx'
import { LoadingScreen } from './ui/screens/LoadingScreen.tsx'
import { MenuScreen } from './ui/screens/MenuScreen.tsx'
import { OptionsScreen } from './ui/screens/OptionsScreen.tsx'
import { ResultScreen } from './ui/screens/ResultScreen.tsx'
import { useAssetLoading } from './ui/useAssetLoading.ts'
import styles from './App.module.css'

type Screen = 'menu' | 'options' | 'game' | 'result'

/**
 * Screen router. Loading → menu → (options | arena) → result.
 *
 * Two rules from the spec §3 live here rather than in the screens:
 * - a match in progress is never persisted, so reloading the page or leaving the arena returns to the
 *   menu with nothing recorded;
 * - a finished match is persisted the moment it ends, which is why the write happens in exactly one
 *   place and nowhere on the way out.
 */
export default function App() {
  const { state, retry } = useAssetLoading()
  const [screen, setScreen] = useState<Screen>('menu')
  const [config, setConfig] = useState<Readonly<GameConfig>>(() => createMatchConfig())
  const [lastResult, setLastResult] = useState<LastMatchResult | undefined>(() => loadLastResult())

  useEffect(() => {
    if (!testHooksEnabled(window.location.search, import.meta.env.MODE)) return
    installTestHooks(createTestHooks())
  }, [])

  const startMatch = useCallback((): void => {
    // Every match reads a snapshot of the options that are current at that moment (spec §3).
    setConfig(createMatchConfig(loadOptions()))
    setScreen('game')
  }, [])

  const finishMatch = useCallback(
    (outcome: MatchOutcome): void => {
      const result: LastMatchResult = {
        score: outcome.score,
        playedSec: outcome.playedSec,
        durationSec: config.match.durationSec,
        endReason: outcome.endReason,
        // The ranking API arrives with M11/M12; until then every result is honestly "pending".
        registration: 'pending',
        finishedAt: new Date().toISOString(),
        configKey: configKey(config),
      }

      saveLastResult(result)
      setLastResult(result)
      setScreen('result')
    },
    [config],
  )

  if (state.status !== 'ready') {
    return (
      <LoadingScreen
        progress={state.progress}
        failures={state.status === 'error' ? state.failures : undefined}
        onRetry={state.status === 'error' ? retry : undefined}
      />
    )
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
        onMatchEnd={finishMatch}
      />
    )
  }

  return (
    <main className={styles.shell}>
      {screen === 'menu' && (
        <MenuScreen
          lastResult={lastResult}
          onPlay={startMatch}
          onOptions={() => {
            setScreen('options')
          }}
        />
      )}
      {screen === 'options' && (
        <OptionsScreen
          onBack={() => {
            setScreen('menu')
          }}
        />
      )}
      {screen === 'result' && lastResult !== undefined && (
        <ResultScreen
          result={lastResult}
          onPlayAgain={startMatch}
          onMenu={() => {
            setScreen('menu')
          }}
        />
      )}
    </main>
  )
}
