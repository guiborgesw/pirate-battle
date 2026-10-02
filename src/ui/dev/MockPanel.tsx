import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

import { getMockDb } from '../../mocks/db.ts'
import {
  SCENARIOS,
  applyScenario,
  currentScenario,
  resetScenarioState,
  type Scenario,
} from '../../mocks/scenarios.ts'
import styles from './MockPanel.module.css'

/**
 * The scenario picker the spec asks for (plan §1.10): a small panel on `Shift+D` that switches the
 * mock scenario and restores the initial mock data.
 *
 * It ships in every build on purpose — the mocks run in the published build too, so a reviewer opening
 * the deployed URL needs a way to walk through the failure cases without editing anything.
 */
export function MockPanel(): ReactNode {
  const [open, setOpen] = useState(false)
  const [scenario, setScenario] = useState<Scenario>(() => currentScenario())
  const queryClient = useQueryClient()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.shiftKey && event.key.toLowerCase() === 'd') setOpen((value) => !value)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (!open) return null

  const choose = (next: Scenario): void => {
    setScenario(next)
    applyScenario(next)
    // Whatever the tabs are showing is now from the wrong world: refetch them under the new scenario.
    void queryClient.invalidateQueries()
  }

  const reset = (): void => {
    // `reset()` rebuilds from the fixtures and persists them. Dropping only the in-memory copy used to
    // re-hydrate the runaway board straight from storage, which is not a reset at all.
    getMockDb().reset()
    resetScenarioState()
    void queryClient.invalidateQueries()
  }

  return (
    <aside className={styles.panel} data-testid="mock-panel">
      <label className={styles.label} htmlFor="mock-scenario">
        Mock scenario
      </label>
      <select
        className={styles.select}
        id="mock-scenario"
        data-testid="mock-scenario"
        value={scenario}
        onChange={(event) => {
          choose(event.target.value as Scenario)
        }}
      >
        {SCENARIOS.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button className={styles.button} type="button" data-testid="mock-reset" onClick={reset}>
        Reset mock data
      </button>
      <p className={styles.hint}>Shift+D closes · ?scenario=&lt;name&gt; also works</p>
    </aside>
  )
}
