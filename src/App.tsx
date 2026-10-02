import { useCallback, useEffect, useState } from 'react'

import { installAudioUnlock } from './game/audio/audio.ts'

import type { MatchRecord } from './api/contracts.ts'
import { buildMatchRecord } from './api/registration.ts'
import { usePendingRegistrations } from './api/useRegistration.ts'
import { configKey, createMatchConfig, type GameConfig } from './config/gameConfig.ts'
import type { MatchOutcome } from './game/GameSession.ts'
import { createTestHooks, installTestHooks, testHooksEnabled } from './game/testHooks.ts'
import { newId } from './storage/ids.ts'
import { loadLastResult, saveLastResult, type LastMatchResult } from './storage/lastResult.ts'
import { getPlayer } from './storage/player.ts'
import { loadOptions } from './storage/settings.ts'
import { GameScreen } from './ui/screens/GameScreen.tsx'
import { LoadingScreen } from './ui/screens/LoadingScreen.tsx'
import { MenuScreen } from './ui/screens/MenuScreen.tsx'
import { OptionsScreen } from './ui/screens/OptionsScreen.tsx'
import { ResultScreen } from './ui/screens/ResultScreen.tsx'
import { MockPanel } from './ui/dev/MockPanel.tsx'
import { CaptainLogScreen, type LogTab } from './ui/log/CaptainLogScreen.tsx'
import { useAssetLoading } from './ui/useAssetLoading.ts'
import styles from './App.module.css'

type Screen = 'menu' | 'options' | 'game' | 'log' | 'result'

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
  const [logTab, setLogTab] = useState<LogTab>('ranking')
  const [record, setRecord] = useState<MatchRecord | undefined>(undefined)
  const { statusOf, submit, retry: retryPending } = usePendingRegistrations()

  useEffect(() => {
    // Whatever a previous visit left waiting goes out as soon as the app is up, and again whenever the
    // browser reports the connection is back (plan §1.9). Running this with an empty queue is free.
    retryPending()

    const onOnline = (): void => {
      retryPending()
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [retryPending])

  useEffect(() => {
    // The browser only lets audio start from a user gesture; this arms that first gesture (spec §2).
    installAudioUnlock()

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
      const playedAt = new Date().toISOString()
      const matchId = newId()

      // The wire record and the local result describe the same match, so they are built together.
      const finished = buildMatchRecord({
        outcome: {
          score: outcome.score,
          playedSec: outcome.playedSec,
          endReason: outcome.endReason,
        },
        durationSec: config.match.durationSec,
        spawnIntervalMs: config.spawn.intervalMs,
        player: getPlayer(),
        matchId,
        playedAt,
      })

      const result: LastMatchResult = {
        matchId,
        score: outcome.score,
        playedSec: outcome.playedSec,
        durationSec: config.match.durationSec,
        endReason: outcome.endReason,
        registration: 'pending',
        finishedAt: playedAt,
        configKey: configKey(config),
      }

      saveLastResult(result)
      setLastResult(result)
      setRecord(finished)
      // Queued before the request goes out, then sent (plan §1.9).
      submit(finished)
      setScreen('result')
    },
    [config, submit],
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
          onOpenLog={(tab) => {
            setLogTab(tab)
            setScreen('log')
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
      {screen === 'log' && (
        <CaptainLogScreen
          initialTab={logTab}
          onBack={() => {
            setScreen('menu')
          }}
        />
      )}
      {screen === 'result' && lastResult !== undefined && (
        <ResultScreen
          result={lastResult}
          registration={statusOf(record?.matchId)}
          onRetry={retryPending}
          onPlayAgain={startMatch}
          onMenu={() => {
            setScreen('menu')
          }}
        />
      )}

      {/* Scenario picker for the mock API (Shift+D). Not drawn over the arena, where it would fight
          with the HUD for the same corner. */}
      <MockPanel />
    </main>
  )
}
