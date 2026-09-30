/**
 * Loads the game assets once per page and exposes the state the loading screen needs.
 *
 * Safe under React Strict Mode: the effect runs twice in development, and both invocations await
 * the same promise (`loadAssets` caches it), so assets are fetched once while unmounted callbacks
 * are ignored through the `aborted` flag.
 */
import { useCallback, useEffect, useState } from 'react'

import type { AssetFailure, AssetProgress, LoadedAssets } from '../game/assets/loadAssets.ts'
import { AssetLoadError, loadAssets } from '../game/assets/loadAssets.ts'

export type AssetLoadState =
  | {
      readonly status: 'loading'
      readonly progress: AssetProgress
      readonly failures: readonly AssetFailure[]
    }
  | { readonly status: 'ready'; readonly progress: AssetProgress; readonly assets: LoadedAssets }
  | {
      readonly status: 'error'
      readonly progress: AssetProgress
      readonly failures: readonly AssetFailure[]
    }

const INITIAL_PROGRESS: AssetProgress = { phase: 'textures', loaded: 0, total: 1 }

export function useAssetLoading(): { state: AssetLoadState; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<AssetLoadState>({
    status: 'loading',
    progress: INITIAL_PROGRESS,
    failures: [],
  })

  useEffect(() => {
    let aborted = false

    loadAssets((progress) => {
      if (aborted) return
      setState({ status: 'loading', progress, failures: [] })
    })
      .then((assets) => {
        if (aborted) return
        setState({
          status: 'ready',
          progress: { phase: 'audio', loaded: 1, total: 1 },
          assets,
        })
      })
      .catch((error: unknown) => {
        if (aborted) return
        const failures =
          error instanceof AssetLoadError
            ? error.failures
            : [{ key: 'assets', reason: String(error) }]
        setState({ status: 'error', progress: INITIAL_PROGRESS, failures })
      })

    return () => {
      aborted = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    // The loading state is restored here instead of inside the effect: React's rules for effects
    // discourage synchronous state updates in an effect body.
    setState({ status: 'loading', progress: INITIAL_PROGRESS, failures: [] })
    setAttempt((value) => value + 1)
  }, [])

  return { state, retry }
}
