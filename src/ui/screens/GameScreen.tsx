import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { LoadedAssets } from '../../game/assets/loadAssets.ts'
import { GameSession, type HudSnapshot, type MatchOutcome } from '../../game/GameSession.ts'
import { setCurrentSession } from '../../game/sessionRegistry.ts'
import type { GameConfig } from '../../config/gameConfig.ts'
import { Hud } from '../hud/Hud.tsx'
import styles from './GameScreen.module.css'

export type GameScreenProps = {
  readonly config: Readonly<GameConfig>
  readonly assets: LoadedAssets
  readonly seed: number
  readonly onExit: () => void
  /** Called exactly once, when a match finishes. Leaving early never reaches this. */
  readonly onMatchEnd: (outcome: MatchOutcome) => void
}

/** Stable object so `useSyncExternalStore` never sees a new snapshot while no session exists. */
const IDLE_SNAPSHOT: HudSnapshot = {
  status: 'ended',
  score: 0,
  remainingSec: 0,
  playerHp: 0,
  endReason: undefined,
  pauseReason: undefined,
}

const noop = (): void => {
  // No session mounted yet: nothing to unsubscribe from.
}

export function GameScreen({ config, assets, seed, onExit, onMatchEnd }: GameScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<GameSession | undefined>(undefined)
  const [session, setSession] = useState<GameSession | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined

    // React Strict Mode runs this effect twice; `aborted` makes sure the session created by the
    // first pass is destroyed instead of leaking a canvas, and the second pass starts cleanly.
    let aborted = false

    GameSession.create({ host, config, seed, assets })
      .then((created) => {
        if (aborted) {
          created.destroy()
          return
        }
        sessionRef.current = created
        setCurrentSession(created)
        setSession(created)
        created.start()
      })
      .catch((cause: unknown) => {
        if (aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })

    return () => {
      aborted = true
      const active = sessionRef.current
      sessionRef.current = undefined
      setCurrentSession(undefined)
      active?.destroy()
    }
  }, [config, seed, assets])

  const subscribe = useCallback(
    (listener: () => void) => session?.subscribe(listener) ?? noop,
    [session],
  )

  const getSnapshot = useCallback(() => session?.getSnapshot() ?? IDLE_SNAPSHOT, [session])

  const hud = useSyncExternalStore(subscribe, getSnapshot)

  // One finished match → one result. `destroy()` also ends the session internally, so the guard is
  // what keeps an abandoned match from being recorded on the way out (spec §3).
  const finishedRef = useRef(false)

  useEffect(() => {
    if (hud.status !== 'ended' || finishedRef.current) return

    const active = sessionRef.current
    if (active === undefined) return

    finishedRef.current = true
    onMatchEnd(active.getOutcome())
  }, [hud.status, onMatchEnd])

  const handlePause = useCallback((): void => {
    sessionRef.current?.pause('user')
  }, [])

  const handleResume = useCallback((): void => {
    sessionRef.current?.resume()
  }, [])

  return (
    <main className={styles.screen} data-testid="arena">
      <div className={styles.canvasHost} ref={hostRef} />
      <Hud snapshot={hud} onExit={onExit} onPause={handlePause} onResume={handleResume} />
      {error !== undefined && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
